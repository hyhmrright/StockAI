import { Ollama } from "ollama";
import type { AIAnalysisResult, StockNews } from "../../shared/types";
import type { AIProvider, ProviderKind } from "../ai";
import { PROVIDER_PROFILES } from "../config";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "../prompts";
import { toErrorMessage, withTimeout, logger } from "../utils";

/**
 * Ollama 本地提供者实现
 */
export class OllamaProvider implements AIProvider {
  readonly kind: ProviderKind = 'ollama';
  private client: Ollama;
  private model: string;

  constructor(host: string = PROVIDER_PROFILES.ollama.baseUrl, model: string = PROVIDER_PROFILES.ollama.model) {
    this.client = new Ollama({ host });
    this.model = model;
  }

  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, PROVIDER_PROFILES.ollama.contentLimit);

    try {
      const response = await withTimeout(
        this.client.chat({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ],
          format: "json"
        }),
        PROVIDER_PROFILES.ollama.timeout,
        "Ollama 服务连接超时，请检查服务是否已启动并在运行。"
      );

      return JSON.parse(response.message.content) as AIAnalysisResult;
    } catch (error) {
      logger.error(`Ollama 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`Ollama 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
