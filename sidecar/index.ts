import type { StockNews, ChatPayload } from '../shared/types';
import type { RawConfig } from './cli-handlers';
import { logger, toErrorMessage, outputJson, logToFile, errorEnvelope, errorEnvelopeFromUnknown } from './utils';
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

/** 命令定义：每条命令的参数提取规则 */
interface CommandDef {
  flag: string;
  /** 从 argv 中提取参数；idx 为 flag 在 argv 中的位置 */
  extract: (args: string[], idx: number) => Omit<ParsedArgs, 'action'>;
}

/** 参数解析结果 */
interface ParsedArgs {
  action: string;
  configStr: string;
  actionParam?: string;
  newsJson?: string;
  quantJson?: string;
}

/** 命令定义表：flag → 参数提取逻辑 */
const COMMAND_TABLE: CommandDef[] = [
  {
    // --list-models：config 从 argv 中找 JSON 串
    flag: '--list-models',
    extract: (args) => ({ configStr: args.find(a => a.startsWith('{')) || '{}' }),
  },
  {
    // --info config_json symbol
    flag: '--info',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 2] }),
  },
  {
    // --search config_json keyword
    flag: '--search',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 2] }),
  },
  {
    // --kline request_json
    flag: '--kline',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 1] }),
  },
  {
    // --quote symbol
    flag: '--quote',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 1] }),
  },
  {
    // --bundle config_json symbol
    flag: '--bundle',
    extract: (args, idx) => ({ configStr: args[idx + 1] || '{}', actionParam: args[idx + 2] }),
  },
  {
    // --analyze-only config_json symbol news_path [quant_json]
    // news 通过临时文件传递（Rust 写入路径），避免 argv 撞 macOS ARG_MAX
    flag: '--analyze-only',
    extract: (args, idx) => ({
      configStr: args[idx + 1] || '{}',
      actionParam: args[idx + 2],
      newsJson: args[idx + 3],
      quantJson: args[idx + 4],
    }),
  },
  {
    // --quant symbol
    flag: '--quant',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 1] }),
  },
  {
    // --backtest symbol
    flag: '--backtest',
    extract: (args, idx) => ({ configStr: '{}', actionParam: args[idx + 1] }),
  },
  {
    // --deep-analysis config_json symbol news_path [quant_json]
    flag: '--deep-analysis',
    extract: (args, idx) => ({
      configStr: args[idx + 1] || '{}',
      actionParam: args[idx + 2],
      newsJson: args[idx + 3],
      quantJson: args[idx + 4],
    }),
  },
  {
    // --chat config_json payload_path（payload 经临时文件传递，含上下文+历史，避免 ARG_MAX）
    flag: '--chat',
    extract: (args, idx) => ({
      configStr: args[idx + 1] || '{}',
      actionParam: args[idx + 2],
    }),
  },
];

/** 解析 argv，按命令表依次匹配；均未命中时走默认分析模式 */
function parseArgs(args: string[]): ParsedArgs {
  for (const cmd of COMMAND_TABLE) {
    const idx = args.indexOf(cmd.flag);
    if (idx >= 0) {
      return { action: cmd.flag, ...cmd.extract(args, idx) };
    }
  }
  // 默认为分析模式: [binary] [symbol] [config_json | @config_path]
  const possibleConfig = args.find(a => a.startsWith('{') || a.startsWith('@'));
  if (possibleConfig) {
    const idx = args.indexOf(possibleConfig);
    return { action: idx > 0 ? args[idx - 1] : '', configStr: possibleConfig };
  }
  return { action: args[args.length - 1] || '', configStr: '{}' };
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
  logToFile(`Argv: [${args.length} items] action=${args.find(a => a.startsWith('--')) ?? 'default'}`);

  // 健康自检逻辑 - 优先运行，不需要加载业务模块
  if (args.includes('--check')) {
    logger.info("运行 Sidecar 健康自检...");
    try {
      const { BrowserManager } = await import('./browser-manager');
      const bm = new BrowserManager();
      const page = await bm.getPage();
      const title = await page.title();
      await bm.close();
      logger.info(`✅ 浏览器连接成功 (标题: "${title || '无'}")`);
      logger.info("✨ Sidecar 健康自检完成，环境正常。");
      process.exit(0);
    } catch (err) {
      logger.error(`❌ Sidecar 自检失败: ${toErrorMessage(err)}`);
      process.exit(1);
    }
  }

  const { resolveConfig } = await import('./configResolver');
  const { Handlers } = await import('./cli-handlers');

  const { action, configStr: rawConfigStr, actionParam, newsJson, quantJson } = parseArgs(args);
  const configStr = await resolveConfigStr(rawConfigStr);

  logger.info(`Sidecar 执行: action=${action}, param=${actionParam}, config_len=${configStr.length}`);

  if (!action) {
    logger.error("未提供有效 Action");
    process.exit(1);
  }

  let rawConfig: Record<string, unknown>;
  try {
    rawConfig = JSON.parse(configStr) as Record<string, unknown>;
  } catch {
    rawConfig = {};
  }

  switch (action) {
    case '--list-models':
      await Handlers.handleListModels(rawConfig as RawConfig);
      break;
    case '--info':
      await Handlers.handleInfo(actionParam || '');
      break;
    case '--search':
      await Handlers.handleSearch(actionParam || '');
      break;
    case '--kline':
      await Handlers.handleKline(actionParam || '{}');
      break;
    case '--quote':
      await Handlers.handleQuote(actionParam || '');
      break;
    case '--bundle':
      try {
        const config = resolveConfig(rawConfig);
        await Handlers.handleFetchBundle(actionParam || '', config);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
    case '--analyze-only':
      try {
        const config = resolveConfig(rawConfig);
        if (!newsJson) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', '未提供 news 文件路径'));
          return;
        }
        let news: StockNews[] = [];
        try {
          // news 始终通过临时文件传递（Rust/Bridge 写入），避免 argv 触发 ARG_MAX
          news = JSON.parse(await Bun.file(newsJson).text());
        } catch (err) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', `读取 news 文件失败: ${toErrorMessage(err)}`));
          return;
        }
        await Handlers.handleAnalyzeOnly(actionParam || '', news, config, quantJson);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
    case '--quant':
      await Handlers.handleQuant(actionParam || '');
      break;
    case '--backtest':
      await Handlers.handleBacktest(actionParam || '');
      break;
    case '--deep-analysis':
      try {
        const config = resolveConfig(rawConfig);
        if (!newsJson) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', '未提供 news 文件路径'));
          return;
        }
        let news: StockNews[] = [];
        try {
          news = JSON.parse(await Bun.file(newsJson).text());
        } catch (err) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', `读取 news 文件失败: ${toErrorMessage(err)}`));
          return;
        }
        await Handlers.handleDeepAnalysis(actionParam || '', news, config, quantJson);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
    case '--chat':
      try {
        const config = resolveConfig(rawConfig);
        if (!actionParam) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', '未提供 chat payload 文件路径'));
          return;
        }
        let payload: ChatPayload;
        try {
          // payload 始终通过临时文件传递（Rust 写入路径），避免 argv 撞 ARG_MAX
          payload = JSON.parse(await Bun.file(actionParam).text());
        } catch (err) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', `读取 chat payload 失败: ${toErrorMessage(err)}`));
          return;
        }
        await Handlers.handleChat(payload, config);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
    default:
      try {
        const config = resolveConfig(rawConfig);
        await Handlers.handleAnalysis(action || '', config);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
  }
}

run().catch(err => {
  logger.error(`执行流异常: ${toErrorMessage(err)}`);
  outputJson(errorEnvelopeFromUnknown('ERR_FATAL', err));
  process.exit(1);
});
