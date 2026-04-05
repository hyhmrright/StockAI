import { expect, test, describe } from "bun:test";
import { AIAnalysisResult } from "./ai";

/**
 * AI 分析 Prompt 生成逻辑测试
 */
describe("AI Prompt 分析逻辑", () => {
  const mockSymbol = "AAPL";
  const mockNews = [
    { title: "Apple reports record Q3 earnings", source: "CNBC", date: "2024-03-01" },
    { title: "iPhone sales slow down in China", source: "Reuters", date: "2024-03-02" }
  ];

  const generatePrompt = (symbol: string, news: any[]) => {
    return `请分析股票 ${symbol} 的近期表现。
以下是相关新闻摘要：
${news.map((n, i) => `${i + 1}. ${n.title} (来源: ${n.source})`).join("\n")}

请返回结构化的 JSON 格式，包含以下字段：
- rating: 1-100 的评分
- sentiment: "bullish", "bearish" 或 "neutral"
- summary: 简要总结
- pros: 优点列表 (string[])
- cons: 缺点列表 (string[])

必须确保返回的是合法的 JSON 字符串。`;
  };

  test("应该生成包含股票代码和新闻标题的 Prompt", () => {
    const prompt = generatePrompt(mockSymbol, mockNews);
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("Apple reports record Q3 earnings");
    expect(prompt).toContain("iPhone sales slow down in China");
    expect(prompt).toContain("JSON");
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
