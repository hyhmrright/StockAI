import { Ollama } from "ollama";
import type { StockNews } from "../../shared/types";
import { AIAnalysisResult, AIProvider } from "../ai";
import { buildAnalysisPrompt } from "../prompts";

/**
 * Ollama 本地提供者实现
 */
export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string;

  constructor(host: string = "http://localhost:11434", model: string = "llama3") {
    this.client = new Ollama({ host });
    this.model = model;
  }

  /**
   * 分析股票 (本地模型)
   */
  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    // Ollama 本地模型 token 限制较低，截断为 800 字符
    const prompt = buildAnalysisPrompt(symbol, news, 800);

    // 增加超时控制：2 分钟 (针对本地大模型分析)
    let timeoutId: any;
    const timeoutPromise = new Promise((_, reject) =>
      timeoutId = setTimeout(() => reject(new Error("Ollama 服务连接超时，请检查服务是否已启动并在运行。")), 120000)
    );

    try {
      const responsePromise = this.client.chat({
        model: this.model,
        messages: [
          { role: "system", content: "你是一个专业的金融分析师。请分析以下信息并返回结构化的 JSON 数据。不要返回 JSON 以外的任何文本。" },
          { role: "user", content: prompt }
        ],
        format: "json"
      });

      const response = await Promise.race([responsePromise, timeoutPromise]) as any;
      clearTimeout(timeoutId);

      const content = response.message.content;
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error("Ollama 分析出错:", error);
      throw new Error(`Ollama 分析失败: ${(error as any).message}`);
    }
  }
}
