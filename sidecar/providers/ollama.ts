import { Ollama } from "ollama";
import { AIAnalysisResult, AIProvider } from "../ai";

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
  async analyze(symbol: string, news: any[]): Promise<AIAnalysisResult> {
    const prompt = this.buildPrompt(symbol, news);

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { role: "system", content: "你是一个专业的金融分析师。请分析以下信息并返回结构化的 JSON 数据。不要返回 JSON 以外的任何文本。" },
          { role: "user", content: prompt }
        ],
        format: "json" // 强制要求 JSON 响应 (如果模型支持)
      });

      const content = response.message.content;
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      console.error("Ollama 分析出错:", error);
      throw new Error(`Ollama 分析失败: ${(error as any).message}`);
    }
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(symbol: string, news: any[]): string {
    const newsList = news.map((n, i) => {
      let item = `${i + 1}. 【标题】: ${n.title}`;
      if (n.content && n.content.length > 50) {
        item += `\n   【正文摘要】: ${n.content.substring(0, 800)}`;
      }
      return item;
    }).join("\n\n");
    
    return `请分析股票 ${symbol}。
近期抓取的新闻内容：

${newsList}

请结合以上新闻及其正文细节，返回以下格式的 JSON 评分报告：
{
  "rating": 1-100 的评分数字,
  "sentiment": "bullish" | "bearish" | "neutral",
  "summary": "分析摘要，请包含新闻中的核心观点",
  "pros": ["利好因素"],
  "cons": ["利空/风险因素"]
}
只需返回 JSON 字符串，不要包含 Markdown 格式标记。`;
  }
}
