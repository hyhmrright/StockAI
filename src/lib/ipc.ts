import { invoke } from "@tauri-apps/api/core";
import { FullAnalysisResponse, ServiceResponse, StockInfo, StockSearchResult } from "../../shared/types";

/**
 * 从原始 stdout 字符串中解析响应，支持标准 ServiceResponse 信封。
 */
export function parseServiceResponse<T>(raw: string): T {
  if (!raw || raw.trim() === '') {
    throw new Error('分析服务无响应，请检查 AI 模型配置后重试。');
  }

  const envelope = JSON.parse(raw) as ServiceResponse<T> & { error?: string };

  // 兼容旧格式（Sidecar 早期版本直接返回带有 error 字段的 T）
  if (typeof envelope.error === 'string') {
    throw new Error(envelope.error);
  }

  // 处理标准信封错误
  if (envelope.error) {
    const { code, message } = envelope.error;
    // 可以在此处针对不同错误码进行特殊处理（如显示不同图标）
    const prefix = code === 'ERR_SCRAPE_EMPTY' ? '🔍 ' : '⚠️ ';
    throw new Error(`${prefix}${message}`);
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
  if (!isTauri()) {
    return [
      { name: "苹果公司", code: "AAPL", type: "美股", fullCode: "gb_aapl" },
      { name: "隆基绿能", code: "601012", type: "A股", fullCode: "sh601012" }
    ];
  }

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
  if (!isTauri()) {
    return {
      name: "苹果公司",
      code: "AAPL",
      exchange: "NASDAQ",
      market: "美股",
      price: 180.5,
      change: 2.5,
      changePercent: 1.4,
      currency: "USD"
    };
  }

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
    console.warn("浏览器测试模式: 尝试通过 3001 桥接器获取真实数据。");
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
      throw new Error("自动化测试环境未就绪，无法获取真实数据。");
    }
  }

  const raw = await invoke<string>("start_analysis", { symbol });
  return parseAnalysisResponse(raw);
}

/**
 * 获取可用模型列表
 */
export async function listModels(provider: string, baseUrl: string): Promise<string[]> {
  if (!isTauri()) {
    return ["gpt-4o", "gpt-4o-mini", "ollama-dev"];
  }

  try {
    const raw = await invoke<string>("list_models", { provider, baseUrl });
    const data = parseServiceResponse<{ models: string[] }>(raw);
    return data.models || [];
  } catch (error) {
    console.error("IPC 调用失败 (list_models):", error);
    return [];
  }
}

/**
 * 判断当前是否运行在 Tauri 环境
 */
const isTauri = () => !!(window as any).__TAURI_INTERNALS__;
