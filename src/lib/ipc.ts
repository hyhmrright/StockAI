import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  StockSearchResult,
  KlineRequest,
  KlinePoint,
  RealtimeQuote,
  BatchQuoteResult,
  MarketBundle,
  StockNews,
  AIAnalysisResult,
  QuantBundle,
  DeepAnalysisResult,
  BacktestResult,
  ChatPayload,
  ChatResponse,
  MasterWeightInput,
  ScreenResponse,
} from '../../shared/types';
import { ServiceError } from './service-errors';
import type { SidecarActionDef, SlotName } from '../../shared/actions';
import { SIDECAR_ACTIONS, CONFIG_SLOT, PAYLOAD_SLOT, buildActionArgs } from '../../shared/actions';
import { MAX_BATCH_QUOTES } from '../../shared/constants';
import {
  MOCK_STOCKS,
  MOCK_MODELS,
  MOCK_KLINE,
  MOCK_QUOTE,
  MOCK_QUOTES,
  MOCK_BUNDLE,
  MOCK_AI_RESULT,
  MOCK_QUANT,
  MOCK_DEEP_ANALYSIS,
  MOCK_BACKTEST,
  MOCK_CHAT,
  MOCK_SCREEN,
} from './dev-mocks';

// ServiceError 的定义已挪到 service-errors.ts（与码表同处），这里再导出保持调用方 import 不变
export { ServiceError };

/**
 * 从原始 stdout 字符串中解析响应，支持标准 ServiceResponse 信封。
 *
 * 传输层自身的失败也一律抛 ServiceError：UI 只能按 code 翻译文案（见
 * lib/service-errors.ts），裸 Error 的 message 无从本地化，等于给 en / ja 用户看中文。
 */
export function parseServiceResponse<T>(raw: string): T {
  if (!raw || raw.trim() === '') {
    throw new ServiceError('ERR_NO_RESPONSE', '分析服务无响应');
  }

  // envelope 形态由 sidecar successEnvelope/errorEnvelope 保证 union 互斥；这里做宽松解构兼容旧格式
  let envelope: { data?: T; error?: { code?: string; message?: string } | string };
  try {
    envelope = JSON.parse(raw) as typeof envelope;
  } catch (e) {
    console.error('JSON 解析失败:', e, '原始数据:', raw);
    throw new ServiceError('ERR_BAD_RESPONSE', `非 JSON 响应: ${raw.substring(0, 50)}...`);
  }

  // 处理旧格式或直接返回错误字符串的情况
  if (typeof envelope.error === 'string') {
    throw new ServiceError('ERR_UNKNOWN', envelope.error);
  }

  // 处理标准信封错误 (error 为对象)：保留 code，便于 UI 显示差异化提示
  if (envelope.error && typeof envelope.error === 'object') {
    const { code, message } = envelope.error;
    throw new ServiceError(code || 'ERR_UNKNOWN', message || '未知服务错误');
  }

  if (envelope.data === undefined) {
    throw new ServiceError('ERR_EMPTY_DATA', '分析服务未返回有效数据');
  }

  return envelope.data;
}

/** 一次 Sidecar 调用的可选负载：大 payload 与临时配置覆盖，均由 Rust 落成临时文件 */
interface CallOptions {
  /** 对应 argv 中的 PAYLOAD_SLOT（news 数组 / chat payload） */
  payload?: unknown;
  /** 对应 CONFIG_SLOT，但用它替代 settings.json（列模型用表单当前编辑值） */
  configOverride?: unknown;
}

/** 通过开发桥接器（3001）尝试拉真实数据；bridge 不在线时退回 mock，避免阻塞浏览器调试 */
let bridgeWarnLogged = false;
async function devBridgeInvoke<T>(args: string[], opts: CallOptions, fallback: T): Promise<T> {
  try {
    const resp = await fetch('http://localhost:3001/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args, ...opts }),
    });
    return parseServiceResponse<T>(await resp.text());
  } catch {
    // 只警告一次，避免 10s 轮询刷屏；让开发者知道当前看的是 mock
    if (!bridgeWarnLogged) {
      console.warn(
        '[dev] sidecar bridge 不在线 (http://localhost:3001)，返回 mock 数据。启动 `bun scripts/sidecar-bridge.ts` 可拉真实数据。',
      );
      bridgeWarnLogged = true;
    }
    return fallback;
  }
}

/**
 * Rust 的 Err(String) 约定为 `ERR_XXX: 诊断`（见 src-tauri/src/lib.rs 顶部错误码说明）。
 * 不解析出 code 的话，这类错误在 UI 上只能降级成兜底文案——「还没保存过配置」会变成
 * 「操作失败，请稍后重试」，en / ja 用户尤其无从下手。
 */
const RUST_CODED_ERROR = /^(ERR_[A-Z0-9_]+): ([\s\S]+)$/;

/** 把 Tauri invoke 抛出的裸字符串还原成带码的 ServiceError；无码的原样包成 Error。 */
export function toServiceError(error: unknown): Error {
  if (error instanceof Error) return error;
  const text = typeof error === 'string' ? error : String(error);
  const matched = RUST_CODED_ERROR.exec(text);
  return matched ? new ServiceError(matched[1], matched[2]) : new Error(text);
}

/**
 * 唯一的 Sidecar 调用管道：按 shared/actions.ts 的清单组装 argv，交给 Rust 的
 * invoke_sidecar。因此新增能力时本文件只需加一个薄封装，不必碰 Rust。
 *
 * 浏览器模式（非 Tauri）走开发桥接器，桥接器不在线时返回传入的 mock。
 * 抛出的一律是 Error，调用方因此无需各自包一层 try/catch 转换。
 */
async function callSidecar<T>(
  action: SidecarActionDef,
  values: Partial<Record<SlotName, string>>,
  devFallback: T,
  opts: CallOptions = {},
): Promise<T> {
  const args = buildActionArgs(action, values);
  try {
    if (!isTauri()) return await devBridgeInvoke<T>(args, opts, devFallback);
    return parseServiceResponse<T>(await invoke<string>('invoke_sidecar', { args, ...opts }));
  } catch (error) {
    throw toServiceError(error);
  }
}

/**
 * 搜索股票建议
 */
export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  try {
    return await callSidecar<StockSearchResult[]>(
      SIDECAR_ACTIONS.search,
      { actionParam: keyword },
      MOCK_STOCKS,
    );
  } catch (error) {
    // 搜索是辅助功能，失败退化为空建议列表而非打断输入
    console.error('IPC 调用失败 (search):', error);
    return [];
  }
}

/**
 * 获取可用模型列表
 * apiKey 用于对非 ollama provider 真打 /models 端点；取自表单当前编辑值（可能尚未保存），
 * 故走 configOverride 而非 settings.json——仍经 0o600 临时文件转移，不进 argv。
 */
export async function listModels(
  provider: string,
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  try {
    const data = await callSidecar<{ models: string[] }>(
      SIDECAR_ACTIONS.listModels,
      { configStr: CONFIG_SLOT },
      { models: MOCK_MODELS },
      { configOverride: { provider, baseUrl, apiKey: apiKey ?? '' } },
    );
    return data.models || [];
  } catch (error) {
    // 不吞错误：返回 [] 会被 UI 显示成"未发现可用模型"，掩盖真正的失败原因
    console.error(`IPC 调用失败 (listModels) [provider=${provider}, baseUrl=${baseUrl}]:`, error);
    throw error;
  }
}

/**
 * 仅拉取 StockInfo + News（不调 LLM）— 新交互流程第一步
 */
export function fetchMarketBundle(symbol: string): Promise<MarketBundle> {
  return callSidecar<MarketBundle>(
    SIDECAR_ACTIONS.bundle,
    { configStr: CONFIG_SLOT, actionParam: symbol },
    MOCK_BUNDLE,
  );
}

/**
 * 显式触发 LLM 分析（基于已抓到的 news）— 新交互流程第二步
 */
export async function analyzeNews(
  symbol: string,
  news: StockNews[],
  quant?: QuantBundle,
): Promise<AIAnalysisResult> {
  return callSidecar<AIAnalysisResult>(
    SIDECAR_ACTIONS.analyzeOnly,
    {
      configStr: CONFIG_SLOT,
      actionParam: symbol,
      newsJson: PAYLOAD_SLOT,
      quantJson: quant ? JSON.stringify(quant) : '',
    },
    MOCK_AI_RESULT,
    { payload: news },
  );
}

export async function deepAnalyze(
  symbol: string,
  news: StockNews[],
  quant?: QuantBundle,
  weights?: MasterWeightInput[],
): Promise<DeepAnalysisResult> {
  return callSidecar<DeepAnalysisResult>(
    SIDECAR_ACTIONS.deepAnalysis,
    {
      configStr: CONFIG_SLOT,
      actionParam: symbol,
      newsJson: PAYLOAD_SLOT,
      quantJson: quant ? JSON.stringify(quant) : '',
      // 权重摘要无敏感数据，直接内联 argv；空/缺省 → sidecar 退化默认权重
      weightsJson: weights?.length ? JSON.stringify(weights) : '',
    },
    MOCK_DEEP_ANALYSIS,
    { payload: news },
  );
}

/** 对话式追问：基于已抓上下文做多轮自然语言问答 */
export async function chat(payload: ChatPayload): Promise<ChatResponse> {
  return callSidecar<ChatResponse>(
    SIDECAR_ACTIONS.chat,
    { configStr: CONFIG_SLOT, actionParam: PAYLOAD_SLOT },
    MOCK_CHAT,
    { payload },
  );
}

export async function fetchQuantBundle(symbol: string): Promise<QuantBundle> {
  return callSidecar<QuantBundle>(SIDECAR_ACTIONS.quant, { actionParam: symbol }, MOCK_QUANT);
}

/**
 * 财报 RAG 预热：提前建索引，把交易所互动平台抓取挪出 chat 首答关键路径。
 * 调用方 fire-and-forget（失败不影响任何主流程），故此处吞掉异常只留日志。
 */
export async function indexReports(symbol: string): Promise<void> {
  try {
    await callSidecar<{ indexed: boolean; docCount: number }>(
      SIDECAR_ACTIONS.indexReports,
      { actionParam: symbol },
      { indexed: false, docCount: 0 },
    );
  } catch (error) {
    console.warn(`财报 RAG 预热失败（不影响主流程） [${symbol}]:`, error);
  }
}

/** 拉取 K 线 */
export async function fetchKline(req: KlineRequest): Promise<KlinePoint[]> {
  return callSidecar<KlinePoint[]>(
    SIDECAR_ACTIONS.kline,
    { actionParam: JSON.stringify(req) },
    MOCK_KLINE,
  );
}

/** 拉取实时报价 */
export async function fetchRealtimeQuote(symbol: string): Promise<RealtimeQuote> {
  return callSidecar<RealtimeQuote>(SIDECAR_ACTIONS.quote, { actionParam: symbol }, MOCK_QUOTE);
}

/**
 * 批量拉取实时报价——关注列表 / 持仓 / 价格告警共用。
 *
 * 逐只调 fetchRealtimeQuote 会按标的数放大 sidecar 进程数（spawn-per-call），
 * 这里一次进程拉完。空列表直接短路，不必为此起进程。
 *
 * 超过 MAX_BATCH_QUOTES 时切批而不是报错：上限是 sidecar 的守卫，不该变成用户
 * 「关注列表最多 50 只」的产品限制。切批后仍是 ⌈N/50⌉ 个进程，远少于逐只的 N 个。
 */
export async function fetchRealtimeQuotes(symbols: string[]): Promise<BatchQuoteResult> {
  if (symbols.length === 0) return { quotes: {}, failed: [] };

  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += MAX_BATCH_QUOTES) {
    batches.push(symbols.slice(i, i + MAX_BATCH_QUOTES));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      callSidecar<BatchQuoteResult>(
        SIDECAR_ACTIONS.quotes,
        { actionParam: batch.join(',') },
        MOCK_QUOTES(batch),
      ),
    ),
  );

  return {
    quotes: Object.assign({}, ...results.map((r) => r.quotes)),
    failed: results.flatMap((r) => r.failed),
  };
}

/** 运行量化回测 */
export async function runBacktest(symbol: string): Promise<BacktestResult> {
  return callSidecar<BacktestResult>(
    SIDECAR_ACTIONS.backtest,
    { actionParam: symbol },
    MOCK_BACKTEST,
  );
}

/**
 * 自然语言选股：把用户自然语言查询交给 sidecar 两阶段全市场筛选。
 * ServiceError（含 code，如 ERR_SCREEN_PARSE / ERR_SCREEN_NO_CONDITIONS）原样透传，
 * 供 useNlScreener 按 code 映射差异化降级文案。
 */
export async function screenStocks(query: string): Promise<ScreenResponse> {
  return callSidecar<ScreenResponse>(
    SIDECAR_ACTIONS.screen,
    { configStr: CONFIG_SLOT, actionParam: query },
    MOCK_SCREEN,
  );
}
