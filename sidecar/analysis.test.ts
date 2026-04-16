import { mock, describe, test, expect, beforeEach } from "bun:test";
import type { StockNews, AIAnalysisResult, StockInfo } from "../shared/types";
import { performFullAnalysis } from "./analysis";

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

/** 测试级依赖工厂——每个 test 构造独立 mocks，避免文件间 mock 状态泄漏 */
function makeDeps(overrides?: {
  scrapeResult?: StockNews[];
  scrapeRejects?: Error;
  fetchInfoResult?: StockInfo | null;
  fetchInfoRejects?: Error;
  analyzeResult?: AIAnalysisResult;
  analyzeRejects?: Error;
}) {
  const scrape = mock(() => overrides?.scrapeRejects
    ? Promise.reject(overrides.scrapeRejects)
    : Promise.resolve(overrides?.scrapeResult ?? DEFAULT_NEWS));

  const fetchInfo = mock(() => overrides?.fetchInfoRejects
    ? Promise.reject(overrides.fetchInfoRejects)
    : Promise.resolve(overrides?.fetchInfoResult ?? null));

  const analyze = mock(() => overrides?.analyzeRejects
    ? Promise.reject(overrides.analyzeRejects)
    : Promise.resolve(overrides?.analyzeResult ?? DEFAULT_ANALYSIS));

  return {
    deps: {
      scrape,
      fetchInfo,
      enhance: (s: string) => Promise.resolve(s),
      createProvider: () => ({ kind: 'openai' as const, analyze }),
    },
    mocks: { scrape, fetchInfo, analyze },
  };
}

describe("performFullAnalysis (Sociable Unit Tests)", () => {
  test("ValidInput_ReturnsFullResponse", async () => {
    const { deps } = makeDeps();
    const result = await performFullAnalysis("AAPL", "openai", { apiKey: "sk-test" }, deps);

    expect(result.symbol).toBe("AAPL");
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
    expect(result.analysis.rating).toBe(DEFAULT_ANALYSIS.rating);
  });

  test("NoNewsFound_ThrowsErrorWithSymbol", async () => {
    const { deps } = makeDeps({ scrapeResult: [] });

    await expect(performFullAnalysis("INVALID", "openai", {}, deps))
      .rejects.toThrow(/未搜寻到股票 "INVALID"/);
  });

  test("StockInfoFetchFailure_ContinuesWithUndefinedInfo", async () => {
    const { deps } = makeDeps({ fetchInfoRejects: new Error("Network Timeout") });

    const result = await performFullAnalysis("AAPL", "openai", {}, deps);
    expect(result.stockInfo).toBeUndefined();
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
  });

  test("AIProviderFailure_GracefulDegradationToNeutral", async () => {
    const { deps } = makeDeps({ analyzeRejects: new Error("Invalid API Key") });

    const result = await performFullAnalysis("AAPL", "openai", {}, deps);
    expect(result.analysis.rating).toBe(50);
    expect(result.analysis.sentiment).toBe('neutral');
    expect(result.analysis.summary).toContain("AI 分析服务暂不可用");
  });
});
