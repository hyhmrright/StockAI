import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  StockSearchResult,
  KlineRequest,
  KlinePoint,
  RealtimeQuote,
  MarketBundle,
  StockNews,
  AIAnalysisResult,
} from "../../shared/types";
import {
  MOCK_STOCKS,
  MOCK_MODELS,
  MOCK_KLINE,
  MOCK_QUOTE,
  MOCK_BUNDLE,
  MOCK_AI_RESULT,
} from "./dev-mocks";

/**
 * 携带服务端错误码的错误，便于 UI 按 code 做差异化提示
 */
export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

/**
 * 从原始 stdout 字符串中解析响应，支持标准 ServiceResponse 信封。
 */
export function parseServiceResponse<T>(raw: string): T {
  if (!raw || raw.trim() === '') {
    throw new Error('分析服务无响应，请检查 AI 模型配置或 Ollama 服务是否已启动。');
  }

  // envelope 形态由 sidecar successEnvelope/errorEnvelope 保证 union 互斥；这里做宽松解构兼容旧格式
  let envelope: { data?: T; error?: { code?: string; message?: string } | string };
  try {
    envelope = JSON.parse(raw) as typeof envelope;
  } catch (e) {
    console.error("JSON 解析失败:", e, "原始数据:", raw);
    throw new Error(`分析服务响应格式错误 (非 JSON)。请检查 Sidecar 运行状态。内容: ${raw.substring(0, 50)}...`);
  }

  // 处理旧格式或直接返回错误字符串的情况
  if (typeof envelope.error === 'string') {
    throw new Error(envelope.error);
  }

  // 处理标准信封错误 (error 为对象)：保留 code，便于 UI 显示差异化提示
  if (envelope.error && typeof envelope.error === 'object') {
    const { code, message } = envelope.error;
    throw new ServiceError(code || 'ERR_UNKNOWN', message || '未知服务错误');
  }

  if (envelope.data === undefined) {
    throw new Error('分析服务未返回有效数据，请重试。');
  }

  return envelope.data;
}

/**
 * 搜索股票建议
 */
export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  if (!isTauri()) return MOCK_STOCKS;

  try {
    const raw = await invoke<string>("search_stocks", { keyword });
    return parseServiceResponse<StockSearchResult[]>(raw);
  } catch (error) {
    console.error("IPC 调用失败 (search_stocks):", error);
    return [];
  }
}

/**
 * 获取可用模型列表
 */
export async function listModels(provider: string, baseUrl: string): Promise<string[]> {
  if (!isTauri()) return MOCK_MODELS;

  try {
    const raw = await invoke<string>("list_models", { provider, baseUrl });
    const data = parseServiceResponse<{ models: string[] }>(raw);
    return data.models || [];
  } catch (error) {
    console.error(`IPC 调用失败 (list_models) [provider=${provider}, baseUrl=${baseUrl}]:`, error);
    // 重新抛出错误，让 UI 能够捕获并显示具体的失败原因，而不是由于返回 [] 导致的"未发现可用模型"掩盖
    throw error;
  }
}

/** 通过开发桥接器（3001）尝试拉真实数据；bridge 不在线时退回 mock，避免阻塞浏览器调试 */
let bridgeWarnLogged = false;
async function devBridgeInvoke<T>(cmd: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  try {
    const resp = await fetch("http://localhost:3001/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, args }),
    });
    return parseServiceResponse<T>(await resp.text());
  } catch {
    // 只警告一次，避免 10s 轮询刷屏；让开发者知道当前看的是 mock
    if (!bridgeWarnLogged) {
      console.warn("[dev] sidecar bridge 不在线 (http://localhost:3001)，返回 mock 数据。启动 `bun scripts/sidecar-bridge.ts` 可拉真实数据。");
      bridgeWarnLogged = true;
    }
    return fallback;
  }
}

/**
 * 仅拉取 StockInfo + News（不调 LLM）— 新交互流程第一步
 */
export async function fetchMarketBundle(symbol: string): Promise<MarketBundle> {
  if (!isTauri()) return devBridgeInvoke<MarketBundle>("fetch_market_bundle", { symbol }, MOCK_BUNDLE);

  try {
    const raw = await invoke<string>("fetch_market_bundle", { symbol });
    return parseServiceResponse<MarketBundle>(raw);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
  }
}

/**
 * 显式触发 LLM 分析（基于已抓到的 news）— 新交互流程第二步
 */
export async function analyzeNews(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
  if (!isTauri()) return devBridgeInvoke<AIAnalysisResult>("analyze_news", { symbol, news }, MOCK_AI_RESULT);

  try {
    const raw = await invoke<string>("analyze_news", { symbol, news });
    return parseServiceResponse<AIAnalysisResult>(raw);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
  }
}

/** 拉取 K 线 */
export async function fetchKline(req: KlineRequest): Promise<KlinePoint[]> {
  if (!isTauri()) return devBridgeInvoke<KlinePoint[]>("fetch_kline", { request: req }, MOCK_KLINE);
  const raw = await invoke<string>("fetch_kline", { request: req });
  return parseServiceResponse<KlinePoint[]>(raw);
}

/** 拉取实时报价 */
export async function fetchRealtimeQuote(symbol: string): Promise<RealtimeQuote> {
  if (!isTauri()) return devBridgeInvoke<RealtimeQuote>("fetch_realtime_quote", { symbol }, MOCK_QUOTE);
  const raw = await invoke<string>("fetch_realtime_quote", { symbol });
  return parseServiceResponse<RealtimeQuote>(raw);
}

