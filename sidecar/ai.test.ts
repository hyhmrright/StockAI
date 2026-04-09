import { expect, test, describe } from "bun:test";
import { AIAnalysisResult } from "./ai";
import { buildAnalysisPrompt } from "./prompts";

/**
 * AI 分析 Prompt 生成逻辑测试
 */
describe("AI Prompt 分析逻辑", () => {
  const mockSymbol = "AAPL";
  const mockNews = [
    { title: "Apple reports record Q3 earnings", source: "CNBC", date: "2024-03-01", content: "Apple today announced financial results for its fiscal 2024 third quarter ended June 29, 2024." },
    { title: "iPhone sales slow down in China", source: "Reuters", date: "2024-03-02", content: "Apple's iPhone sales in China fell 19% in the first quarter of 2024." }
  ];

  test("buildAnalysisPrompt 应该生成包含股票代码和新闻标题的 Prompt", () => {
    const prompt = buildAnalysisPrompt(mockSymbol, mockNews);
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("Apple reports record Q3 earnings");
    expect(prompt).toContain("iPhone sales slow down in China");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("资深金融分析师");
  });

  test("buildAnalysisPrompt 应该支持自定义 contentLimit", () => {
    const longContent = "A".repeat(2000);
    const news = [{ title: "Test", source: "Test", content: longContent }];
    const prompt800 = buildAnalysisPrompt("TEST", news, 800);
    const prompt1000 = buildAnalysisPrompt("TEST", news, 1000);
    // 800 截断应该比 1000 截断的结果短
    expect(prompt800.length).toBeLessThan(prompt1000.length);
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
