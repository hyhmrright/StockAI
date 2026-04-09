import { invoke } from "@tauri-apps/api/core";

/**
 * 判断当前是否运行在 Tauri 环境
 */
const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

/**
 * 启动股票分析 (调用 Sidecar 抓取新闻)
 * @param symbol 股票代码
 */
export async function startAnalysis(symbol: string): Promise<string> {
  // 浏览器自动化测试环境下，通过桥接器调用真实 Sidecar
  if (!isTauri()) {
    console.warn("浏览器测试模式: 尝试通过 3001 桥接器获取真实数据。");
    try {
      const resp = await fetch('http://localhost:3001/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'start_analysis', args: { symbol } })
      });
      return await resp.text();
    } catch (e) {
      console.error("桥接器连接失败，请确保 'bun run scripts/sidecar-bridge.ts' 正在运行。");
      throw new Error("自动化测试环境未就绪，无法获取真实数据。");
    }
  }

  try {
    const result = await invoke<string>("start_analysis", { symbol });
    return result;
  } catch (error) {
    console.error("IPC 调用失败 (start_analysis):", error);
    throw error;
  }
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
