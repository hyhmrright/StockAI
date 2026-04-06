import { expect, test, describe } from "bun:test";
import { AIAnalysisResult } from "./ai";
import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";

/**
 * AI 分析 Prompt 生成逻辑测试
 */
describe("AI Prompt 分析逻辑", () => {
  const mockSymbol = "AAPL";
  const mockNews = [
    { title: "Apple reports record Q3 earnings", source: "CNBC", date: "2024-03-01", content: "Apple today announced financial results for its fiscal 2024 third quarter ended June 29, 2024." },
    { title: "iPhone sales slow down in China", source: "Reuters", date: "2024-03-02", content: "Apple's iPhone sales in China fell 19% in the first quarter of 2024." }
  ];

  test("OpenAIProvider 应该生成包含股票代码和新闻标题的 Prompt", () => {
    const prompt = OpenAIProvider.buildPrompt(mockSymbol, mockNews);
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("Apple reports record Q3 earnings");
    expect(prompt).toContain("iPhone sales slow down in China");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("资深金融分析师");
  });

  test("OllamaProvider 应该生成包含股票代码和新闻标题的 Prompt", () => {
    const prompt = OllamaProvider.buildPrompt(mockSymbol, mockNews);
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("Apple reports record Q3 earnings");
    expect(prompt).toContain("iPhone sales slow down in China");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("评分报告");
  });

  test("解析模拟的 AI JSON 响应", () => {
    const mockJsonResponse = JSON.stringify({
      rating: 85,
      sentiment: "bullish",
      summary: "苹果业绩强劲，尽管面临地区性压力。",
      pros: ["财报超预期", "服务业务增长"],
      cons: ["中国市场销售疲软"]
    });

    const result: AIAnalysisResult = JSON.parse(mockJsonResponse);
    expect(result.rating).toBe(85);
    expect(result.sentiment).toBe("bullish");
    expect(result.pros).toHaveLength(2);
    expect(result.cons).toContain("中国市场销售疲软");
  });
});
