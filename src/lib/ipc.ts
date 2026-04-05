import { invoke } from "@tauri-apps/api/core";

/**
 * 启动股票分析 (调用 Sidecar 抓取新闻)
 * @param symbol 股票代码
 * @returns 抓取到的 JSON 结果字符串
 */
export async function startAnalysis(symbol: string): Promise<string> {
  try {
    const result = await invoke<string>("start_analysis", { symbol });
    return result;
  } catch (error) {
    console.error("IPC 调用失败 (start_analysis):", error);
    throw error;
  }
}
