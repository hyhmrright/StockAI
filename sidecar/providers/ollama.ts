import { Ollama } from "ollama";
import type { AIAnalysisResult, StockNews, QuantBundle, Language } from "../../shared/types";
import type { AIProvider, ProviderKind } from "../ai";
import { resolveLanguage } from "../ai";
import { PROVIDER_PROFILES } from "../config";
import { buildAnalysisPrompt, buildEnhancedPrompt, getSystemPrompt } from "../prompts";
import { toErrorMessage, withTimeout, logger, parseJsonFromAi } from "../utils";

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

  async analyze(symbol: string, news: StockNews[], quant?: QuantBundle, language?: Language): Promise<AIAnalysisResult> {
    const lang = resolveLanguage(language);
    const prompt = quant
      ? buildEnhancedPrompt(symbol, news, quant, lang, PROVIDER_PROFILES.ollama.contentLimit)
      : buildAnalysisPrompt(symbol, news, lang, PROVIDER_PROFILES.ollama.contentLimit);

    try {
      const response = await withTimeout(
        this.client.chat({
          model: this.model,
          messages: [
            { role: "system", content: getSystemPrompt(lang) },
            { role: "user", content: prompt }
          ],
          format: "json"
        }),
        PROVIDER_PROFILES.ollama.timeout,
        "Ollama 服务连接超时，请检查服务是否已启动并在运行。"
      );

      return parseJsonFromAi<AIAnalysisResult>(response.message.content);
    } catch (error) {
      logger.error(`Ollama 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`Ollama 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
