import { invoke, isTauri } from "@tauri-apps/api/core";
import { FullAnalysisResponse, ServiceResponse, StockInfo, StockSearchResult, KlineRequest, KlinePoint, RealtimeQuote } from "../../shared/types";
import {
  MOCK_STOCKS,
  MOCK_STOCK_INFO,
  MOCK_MODELS,
  MOCK_KLINE,
  MOCK_QUOTE,
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

  let envelope: ServiceResponse<T> & { error?: any };
  try {
    envelope = JSON.parse(raw);
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
 * 获取股票基本信息
 */
export async function getStockInfo(symbol: string): Promise<StockInfo> {
  if (!isTauri()) return MOCK_STOCK_INFO;

  const raw = await invoke<string>("get_stock_info", { symbol });
  return parseServiceResponse<StockInfo>(raw);
}

/**
 * 保持向后兼容：解析分析结果
 */
export function parseAnalysisResponse(raw: string): FullAnalysisResponse {
  const data = parseServiceResponse<FullAnalysisResponse>(raw);

  if (!data.analysis || typeof data.analysis.rating !== 'number' || !Array.isArray(data.news)) {
    throw new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。');
  }

  return data;
}

/**
 * 启动股票分析
 */
export async function startAnalysis(symbol: string): Promise<FullAnalysisResponse> {
  if (!isTauri()) {
    if (import.meta.env.DEV) {
      console.warn("浏览器开发模式: 尝试通过 3001 桥接器获取真实数据。");
      try {
        const resp = await fetch('http://localhost:3001/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'start_analysis', args: { symbol } })
        });
        return parseAnalysisResponse(await resp.text());
      } catch (e) {
        if (e instanceof Error && (
          e.message.includes('分析服务无响应') ||
          e.message.includes('分析结果格式异常') ||
          e.message.includes('版本不兼容')
        )) {
          throw e;
        }
        throw new Error(`开发桥接器未就绪，请先启动 bun scripts/sidecar-bridge.ts。(原因: ${e instanceof Error ? e.message : String(e)})`);
      }
    }
    throw new Error('此功能仅在 Tauri 桌面应用中可用。');
  }

  try {
    const raw = await invoke<string>("start_analysis", { symbol });
    return parseAnalysisResponse(raw);
  } catch (error) {
    // Tauri 在 Rust 返回 Err(String) 时抛出字符串而非 Error，统一包装以保证调用方始终收到 Error 实例
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
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

