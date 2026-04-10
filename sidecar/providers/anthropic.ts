import Anthropic from "@anthropic-ai/sdk";
import type { StockNews } from "../../shared/types";
import { AIAnalysisResult, AIProvider } from "../ai";
import { CONTENT_LIMITS, PROVIDER_DEFAULTS, TIMEOUTS } from "../config";
import { buildAnalysisPrompt } from "../prompts";
import { toErrorMessage, withTimeout, logger } from "../utils";

/**
 * Anthropic Claude 提供者实现
 */
export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model: string = PROVIDER_DEFAULTS.anthropic.model) {
    this.client = new Anthropic({ apiKey: apiKey || "" });
    this.model = model;
  }

  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, CONTENT_LIMITS.anthropic);

    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: "你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。请始终以 JSON 格式回复，不包含 Markdown 代码块标记。",
          messages: [{ role: "user", content: prompt }],
        }),
        TIMEOUTS.anthropic,
        "Anthropic 请求超时"
      );

      const block = response.content[0];
      const content = block.type === "text" ? block.text : "{}";
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      logger.error(`Anthropic 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`Anthropic 分析失败: ${toErrorMessage(error)}`);
    }
  }
}
