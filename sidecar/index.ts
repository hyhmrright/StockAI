import type { StockNews, ChatPayload } from '../shared/types';
import type { SidecarActionDef, SlotName } from '../shared/actions';
import { SIDECAR_ACTIONS, DEFAULT_ANALYSIS_SLOTS } from '../shared/actions';
import type { RawConfig } from './cli-handlers';
import {
  logger,
  toErrorMessage,
  outputJson,
  logToFile,
  errorEnvelope,
  errorEnvelopeFromUnknown,
} from './utils';
import { tmpdir } from 'os';
import { resolve, basename } from 'path';

/**
 * 紧急入口点：确保错误拦截器在任何业务逻辑加载前运行。
 */
process.on('uncaughtException', (err) => {
  const msg = toErrorMessage(err);
  logger.error(`[CRITICAL] 未捕获异常: ${msg}`);
  outputJson(errorEnvelope('ERR_BOOT_CRASH', `启动崩溃: ${msg}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = toErrorMessage(reason);
  logger.error(`[CRITICAL] Promise 拒绝: ${msg}`);
  outputJson(errorEnvelope('ERR_BOOT_ASYNC', `异步启动失败: ${msg}`));
  process.exit(1);
});

/** 参数解析结果：槽位名 → 值，槽位布局来自 shared/actions.ts 的清单 */
export type ParsedArgs = { action: string } & Partial<Record<SlotName, string>>;

/** flag → 定义。用于「从 argv 里认出动作标志」，与声明顺序无关。 */
const FLAG_TO_ACTION = new Map<string, SidecarActionDef>(
  Object.values(SIDECAR_ACTIONS).map((def) => [def.flag, def]),
);

/**
 * 按 shared/actions.ts 的清单解析 argv：命中某 flag 后，其后的参数按该 action 的
 * slots 顺序逐位取值。均未命中时走默认分析模式（`<symbol> <@config>`，无 flag）。
 *
 * 必须**从左到右扫 argv 取第一个已知 flag**，不能反过来「按 action 顺序去 argv 里找」——
 * 后者会让用户传入的值抢戏：选股 query 里若含 "--quant"，`--screen` 就会按声明顺序
 * 被误派成 `--quant`。动作标志恒在参数之前，取最左侧的即是真正的动作。
 */
export function parseArgs(args: string[]): ParsedArgs {
  for (let i = 0; i < args.length; i++) {
    const def = FLAG_TO_ACTION.get(args[i]);
    if (!def) continue;
    const parsed: ParsedArgs = { action: def.flag };
    def.slots.forEach((slot, s) => {
      parsed[slot] = args[i + 1 + s];
    });
    return parsed;
  }

  // 默认分析模式：config 以 '{' 或 '@' 开头，symbol 紧邻其前
  const configStr = args.find((a) => a.startsWith('{') || a.startsWith('@'));
  const parsed: ParsedArgs = { action: '' };
  if (configStr) {
    const idx = args.indexOf(configStr);
    const values = [idx > 0 ? args[idx - 1] : '', configStr];
    DEFAULT_ANALYSIS_SLOTS.forEach((slot, i) => {
      parsed[slot] = values[i];
    });
  } else {
    parsed.actionParam = args[args.length - 1] || '';
    parsed.configStr = '{}';
  }
  return parsed;
}

/** 解析 config 字符串：@ 前缀表示从临时文件读取，否则视为内联 JSON */
async function resolveConfigStr(str: string): Promise<string> {
  if (str.startsWith('@')) {
    const filePath = resolve(str.slice(1));
    if (!filePath.startsWith(tmpdir()) || !basename(filePath).startsWith('stockai-')) {
      throw new Error('无效的配置文件路径：必须是 StockAI 临时文件');
    }
    return await Bun.file(filePath).text();
  }
  return str;
}

async function run() {
  const args = process.argv;
  logToFile(
    `Argv: [${args.length} items] action=${args.find((a) => a.startsWith('--')) ?? 'default'}`,
  );

  // 健康自检逻辑 - 优先运行，不需要加载业务模块
  if (args.includes('--check')) {
    logger.info('运行 Sidecar 健康自检...');
    try {
      const { BrowserManager } = await import('./browser-manager');
      const bm = new BrowserManager();
      const page = await bm.getPage();
      const title = await page.title();
      await bm.close();
      logger.info(`✅ 浏览器连接成功 (标题: "${title || '无'}")`);
      logger.info('✨ Sidecar 健康自检完成，环境正常。');
      process.exit(0);
    } catch (err) {
      logger.error(`❌ Sidecar 自检失败: ${toErrorMessage(err)}`);
      process.exit(1);
    }
  }

  const { resolveConfig } = await import('./configResolver');
  type ResolvedConfig = ReturnType<typeof resolveConfig>;
  const { Handlers } = await import('./cli-handlers');

  const parsed = parseArgs(args);
  const { action, actionParam = '', newsJson, quantJson, weightsJson } = parsed;
  const configStr = await resolveConfigStr(parsed.configStr ?? '{}');

  logger.info(
    `Sidecar 执行: action=${action || 'default'}, param=${actionParam}, config_len=${configStr.length}`,
  );

  if (!action && !actionParam) {
    logger.error('未提供有效 Action');
    process.exit(1);
  }

  let rawConfig: Record<string, unknown>;
  try {
    rawConfig = JSON.parse(configStr) as Record<string, unknown>;
  } catch {
    rawConfig = {};
  }

  /**
   * 包装需要配置的 action：配置解析失败即写 ERR_CONFIG 信封并跳过 handler。
   * 让 DISPATCH 里每条都不必自己重复 try/catch。
   */
  function withConfig(handle: (config: ResolvedConfig) => Promise<void>): () => Promise<void> {
    return async () => {
      let config: ResolvedConfig;
      try {
        config = resolveConfig(rawConfig);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
        return;
      }
      await handle(config);
    };
  }

  /**
   * 读取经临时文件转移的 JSON payload（news / chat payload）——它们体积可能超过
   * macOS ARG_MAX，故由 Rust/桥接器写盘后只传路径。失败写 ERR_MISSING_PARAM 并返回 null。
   */
  async function readPayload<T>(path: string | undefined, label: string): Promise<T | null> {
    if (!path) {
      outputJson(errorEnvelope('ERR_MISSING_PARAM', `未提供 ${label} 文件路径`));
      return null;
    }
    try {
      return JSON.parse(await Bun.file(path).text()) as T;
    } catch (err) {
      outputJson(
        errorEnvelope('ERR_MISSING_PARAM', `读取 ${label} 文件失败: ${toErrorMessage(err)}`),
      );
      return null;
    }
  }

  /**
   * flag → handler 调用。与 shared/actions.ts 的清单一一对应：清单声明「参数怎么排」，
   * 此表声明「参数怎么交给 handler」。新增 action 时两处各加一行即可。
   */
  const DISPATCH: Record<string, () => Promise<void>> = {
    [SIDECAR_ACTIONS.listModels.flag]: () => Handlers.handleListModels(rawConfig as RawConfig),
    [SIDECAR_ACTIONS.info.flag]: () => Handlers.handleInfo(actionParam),
    [SIDECAR_ACTIONS.search.flag]: () => Handlers.handleSearch(actionParam),
    [SIDECAR_ACTIONS.kline.flag]: () => Handlers.handleKline(actionParam || '{}'),
    [SIDECAR_ACTIONS.quote.flag]: () => Handlers.handleQuote(actionParam),
    [SIDECAR_ACTIONS.quotes.flag]: () => Handlers.handleQuotes(actionParam),
    [SIDECAR_ACTIONS.quant.flag]: () => Handlers.handleQuant(actionParam),
    [SIDECAR_ACTIONS.indexReports.flag]: () => Handlers.handleIndexReports(actionParam),
    [SIDECAR_ACTIONS.backtest.flag]: () => Handlers.handleBacktest(actionParam),
    [SIDECAR_ACTIONS.marketSnapshot.flag]: () => Handlers.handleMarketSnapshot(),
    // newsJson 槽位在此复用为 periods 字符串（可选，缺省默认 12 期）
    [SIDECAR_ACTIONS.fundamentalsHistory.flag]: () =>
      Handlers.handleFinancialHistory(actionParam, newsJson),

    [SIDECAR_ACTIONS.bundle.flag]: withConfig((cfg) =>
      Handlers.handleFetchBundle(actionParam, cfg),
    ),
    [SIDECAR_ACTIONS.screen.flag]: withConfig((cfg) => Handlers.handleScreen(actionParam, cfg)),
    [SIDECAR_ACTIONS.analyzeOnly.flag]: withConfig(async (cfg) => {
      const news = await readPayload<StockNews[]>(newsJson, 'news');
      if (news) await Handlers.handleAnalyzeOnly(actionParam, news, cfg, quantJson);
    }),
    [SIDECAR_ACTIONS.deepAnalysis.flag]: withConfig(async (cfg) => {
      const news = await readPayload<StockNews[]>(newsJson, 'news');
      if (news) await Handlers.handleDeepAnalysis(actionParam, news, cfg, quantJson, weightsJson);
    }),
    [SIDECAR_ACTIONS.chat.flag]: withConfig(async (cfg) => {
      const payload = await readPayload<ChatPayload>(actionParam, 'chat payload');
      if (payload) await Handlers.handleChat(payload, cfg);
    }),
  };

  // 默认分析模式（向后兼容；新交互流程走 --bundle + --analyze-only）
  const dispatch =
    DISPATCH[action] ?? withConfig((cfg) => Handlers.handleAnalysis(actionParam, cfg));
  await dispatch();
}

// 仅作为 CLI 入口被直接执行时才跑；被 import（如 parseArgs 的单测）时不启动业务流程
if (import.meta.main) {
  run().catch((err) => {
    logger.error(`执行流异常: ${toErrorMessage(err)}`);
    outputJson(errorEnvelopeFromUnknown('ERR_FATAL', err));
    process.exit(1);
  });
}
