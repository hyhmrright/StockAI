import { Ollama } from "ollama";
import type { StockNews } from "../../shared/types";
import { AIAnalysisResult, AIProvider } from "../ai";
import { CONTENT_LIMITS, PROVIDER_DEFAULTS, TIMEOUTS } from "../config";
import { buildAnalysisPrompt } from "../prompts";
import { toErrorMessage, withTimeout, logger } from "../utils";

/**
 * Ollama 本地提供者实现
 */
export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string;

  constructor(host: string = PROVIDER_DEFAULTS.ollama.baseUrl, model: string = PROVIDER_DEFAULTS.ollama.model) {
    this.client = new Ollama({ host });
    this.model = model;
  }

  /**
   * 分析股票 (本地模型)
   */
  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, CONTENT_LIMITS.ollama);

    try {
      const response = await withTimeout(
        this.client.chat({
          model: this.model,
          messages: [
            { role: "system", content: "你是一个专业的金融分析师。请分析以下信息并返回结构化的 JSON 数据。不要返回 JSON 以外的任何文本。" },
            { role: "user", content: prompt }
          ],
          format: "json"
        }),
        TIMEOUTS.ollama,
        "Ollama 服务连接超时，请检查服务是否已启动并在运行。"
      );

      return JSON.parse(response.message.content) as AIAnalysisResult;
    } catch (error) {
      logger.error(`Ollama 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`Ollama 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
