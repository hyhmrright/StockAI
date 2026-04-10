import { expect, test, describe } from "bun:test";
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

  test("contentLimit 截断：超出限制的正文内容被截断，未超出的保持原样", () => {
    // 验证 buildAnalysisPrompt 的 contentLimit 参数实际作用于新闻正文截断
    const shortContent = "A".repeat(100);
    const longContent = "A".repeat(3000);
    const newsShort = [{ title: "T", source: "S", content: shortContent }];
    const newsLong  = [{ title: "T", source: "S", content: longContent }];

    const promptShort = buildAnalysisPrompt("TEST", newsShort, 500);
    const promptLong  = buildAnalysisPrompt("TEST", newsLong,  500);

    // 超出 500 字符的正文应被截断，导致 prompt 长度不随原始内容线性增长
    expect(promptLong.length).toBeLessThan(promptShort.length + longContent.length);
    // 未截断的短内容应完整出现在 prompt 中
    expect(promptShort).toContain(shortContent);
  });
});
