import Anthropic from "@anthropic-ai/sdk";
import type { AIAnalysisResult, StockNews } from "../../shared/types";
import type { AIProvider, ProviderKind } from "../ai";
import { PROVIDER_PROFILES } from "../config";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "../prompts";
import { toErrorMessage, withTimeout, logger } from "../utils";

/**
 * Anthropic Claude 提供者实现
 */
export class AnthropicProvider implements AIProvider {
  readonly kind: ProviderKind = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model: string = PROVIDER_PROFILES.anthropic.model) {
    this.client = new Anthropic({ apiKey: apiKey || "" });
    this.model = model;
  }

  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, PROVIDER_PROFILES.anthropic.contentLimit);

    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
        PROVIDER_PROFILES.anthropic.timeout,
        "Anthropic 请求超时"
      );

      if (!response.content?.length) {
        throw new Error('Anthropic 返回了空的 content 列表，无法提取分析结果');
      }
      const block = response.content[0];
      const content = block.type === "text" ? block.text : "{}";
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      logger.error(`Anthropic 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`Anthropic 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
