import OpenAI from "openai";
import { AIAnalysisResult, AIProvider } from "../ai";

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
  async analyze(symbol: string, news: any[]): Promise<AIAnalysisResult> {
    const prompt = this.buildPrompt(symbol, news);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: "你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。请始终以 JSON 格式回复。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" } // 强制要求 JSON 响应 (如果模型支持)
      });

      const content = response.choices[0].message.content || "{}";
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      console.error("OpenAI 分析出错:", error);
      throw new Error(`OpenAI 分析失败: ${(error as any).message}`);
    }
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(symbol: string, news: any[]): string {
    const newsList = news.map((n, i) => `${i + 1}. ${n.title} (来源: ${n.source})`).join("\n");
    
    return `请分析股票 ${symbol} 的近期表现。
以下是关于该股票的最新新闻：
${newsList}

请根据以上信息提供一个结构化的分析报告，返回以下 JSON 格式：
{
  "rating": 1-100 的评分数字 (例如 85),
  "sentiment": "bullish" (看涨), "bearish" (看跌) 或 "neutral" (中性),
  "summary": "一段话的总结性描述",
  "pros": ["理由 1", "理由 2"],
  "cons": ["风险 1", "风险 2"]
}

必须确保返回的是合法的 JSON 字符串，不包含 Markdown 代码块标记。`;
  }
}
