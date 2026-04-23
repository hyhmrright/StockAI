import OpenAI from "openai";
import type { AIAnalysisResult, StockNews } from "../../shared/types";
import type { AIProvider, ProviderKind } from "../ai";
import { PROVIDER_PROFILES } from "../config";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "../prompts";
import { toErrorMessage, logger, parseJsonFromAi } from "../utils";

/**
 * OpenAI 提供者实现
 */
export class OpenAIProvider implements AIProvider {
  readonly kind: ProviderKind = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, baseURL?: string, model: string = PROVIDER_PROFILES.openai.model) {
    // 优先使用构造函数传入的参数，否则使用环境变量
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseURL || process.env.OPENAI_BASE_URL,
    });
    this.model = model;
  }

  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, PROVIDER_PROFILES.openai.contentLimit);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }, { timeout: PROVIDER_PROFILES.openai.timeout });

      if (!response.choices?.length) {
        throw new Error('OpenAI 返回了空的 choices 列表，无法提取分析结果');
      }
      const content = response.choices[0].message.content || "{}";
      return parseJsonFromAi<AIAnalysisResult>(content);
    } catch (error) {
      logger.error(`OpenAI 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`OpenAI 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
