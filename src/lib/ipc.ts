import { invoke } from "@tauri-apps/api/core";
import { FullAnalysisResponse } from "../../shared/types";

/**
 * 判断当前是否运行在 Tauri 环境
 */
const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

/**
 * 从原始 stdout 字符串中解析分析结果，集中处理验证和错误转换。
 * 调用方只接触强类型的 FullAnalysisResponse，不需要处理 JSON 或错误格式。
 */
export function parseAnalysisResponse(raw: string): FullAnalysisResponse {
  if (!raw || raw.trim() === '') {
    throw new Error('分析服务无响应，请检查 AI 模型配置后重试。');
  }

  const parsed = JSON.parse(raw) as FullAnalysisResponse & { error?: string };

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.analysis || typeof parsed.analysis.rating !== 'number' || !Array.isArray(parsed.news)) {
    throw new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。');
  }

  return parsed;
}

/**
 * 启动股票分析，返回结构化响应。
 * JSON 解析和错误提取在此层完成，调用方无需处理裸字符串。
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
        e.message.includes('配置格式版本不兼容')
      )) {
        throw e;
      }
      console.error("桥接器连接失败，请确保 'bun run scripts/sidecar-bridge.ts' 正在运行。");
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
    const result = await invoke<string>("list_models", { provider, baseUrl });
    const parsed = JSON.parse(result);
    if (parsed.error) throw new Error(parsed.error);
    return parsed.models || [];
  } catch (error) {
    console.error("IPC 调用失败 (list_models):", error);
    return ["gpt-4o"];
  }
}
