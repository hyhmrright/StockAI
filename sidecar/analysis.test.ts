import { mock, describe, test, expect, beforeEach } from "bun:test";
import type { StockNews, AIAnalysisResult } from "../shared/types";

const DEFAULT_NEWS: StockNews[] = [
  { title: "测试新闻", source: "Test", date: "2025-01-01", content: "内容", url: "http://test.com" },
];

const DEFAULT_ANALYSIS: AIAnalysisResult = {
  rating: 80,
  sentiment: "bullish",
  summary: "看涨",
  pros: ["利多"],
  cons: ["利空"],
};

// 集中定义 Mock 行为
const mocks = {
  scrape: mock(() => Promise.resolve(DEFAULT_NEWS)),
  fetchInfo: mock(() => Promise.resolve(null)),
  analyze: mock(() => Promise.resolve(DEFAULT_ANALYSIS)),
};

mock.module("./scraper", () => ({ scrapeStockNews: mocks.scrape }));
mock.module("./stock-info", () => ({ fetchStockInfo: mocks.fetchInfo }));
mock.module("./providers/registry", () => ({
  createProvider: () => ({ analyze: mocks.analyze }),
}));

const { performFullAnalysis } = await import("./analysis");

describe("performFullAnalysis (Sociable Unit Tests)", () => {
  beforeEach(() => {
    // 统一重置所有 Mock 到默认成功状态，减少每个 test 内的样板代码
    Object.values(mocks).forEach(m => {
      m.mockReset();
      m.mockResolvedValue(m === mocks.scrape ? DEFAULT_NEWS : (m === mocks.analyze ? DEFAULT_ANALYSIS : null) as any);
    });
  });

  test("performFullAnalysis_ValidInput_ReturnsFullResponse", async () => {
    const result = await performFullAnalysis("AAPL", "openai", { apiKey: "sk-test" });
    
    expect(result.symbol).toBe("AAPL");
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
    expect(result.analysis.rating).toBe(DEFAULT_ANALYSIS.rating);
  });

  test("performFullAnalysis_NoNewsFound_ThrowsErrorWithSymbol", async () => {
    mocks.scrape.mockResolvedValue([]);
    
    await expect(performFullAnalysis("INVALID", "openai", {}))
      .rejects.toThrow(/未搜寻到股票 "INVALID"/);
  });

  test("performFullAnalysis_StockInfoFetchFailure_ContinuesWithUndefinedInfo", async () => {
    mocks.fetchInfo.mockRejectedValue(new Error("Network Timeout"));
    
    const result = await performFullAnalysis("AAPL", "openai", {});
    expect(result.stockInfo).toBeUndefined();
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
  });

  test("performFullAnalysis_AIProviderFailure_GracefulDegradationToNeutral", async () => {
    mocks.analyze.mockRejectedValue(new Error("Invalid API Key"));
    
    const result = await performFullAnalysis("AAPL", "openai", {});
    expect(result.analysis.rating).toBe(50);
    expect(result.analysis.sentiment).toBe('neutral');
    expect(result.analysis.summary).toContain("AI 分析服务暂不可用");
  });
});
