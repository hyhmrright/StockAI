import OpenAI from "openai";
import type { StockNews } from "../../shared/types";
import { AIAnalysisResult, AIProvider } from "../ai";
import { buildAnalysisPrompt } from "../prompts";

/**
 * OpenAI 提供者实现
 */
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, baseURL?: string, model: string = "gpt-4o") {
    // 优先使用构造函数传入的参数，否则使用环境变量
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseURL || process.env.OPENAI_BASE_URL,
    });
    this.model = model;
  }

  /**
   * 分析股票
   */
  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> {
    const prompt = buildAnalysisPrompt(symbol, news, 1000);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。请始终以 JSON 格式回复。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }, { timeout: 60000 });

      const content = response.choices[0].message.content || "{}";
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      console.error("OpenAI 分析出错:", error);
      throw new Error(`OpenAI 分析失败: ${(error as any).message}`);
    }
  }
}
