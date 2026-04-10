import { mock, describe, test, expect, beforeEach } from "bun:test";
import type { StockNews, AIAnalysisResult } from "../shared/types";

// 默认测试数据——单处定义，避免 mock 初始化和 beforeEach 重置之间的重复
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

// mock.module 必须在 import 被模块加载前调用
const scrapeStockNewsMock = mock(() => Promise.resolve(DEFAULT_NEWS));
const fetchStockInfoMock = mock(() => Promise.resolve(null));
const analyzeMock = mock(() => Promise.resolve(DEFAULT_ANALYSIS));

mock.module("./scraper", () => ({ scrapeStockNews: scrapeStockNewsMock }));
mock.module("./stock-info", () => ({ fetchStockInfo: fetchStockInfoMock }));
mock.module("./providers/registry", () => ({
  createProvider: () => ({ analyze: analyzeMock }),
}));

const { performFullAnalysis } = await import("./analysis");

describe("performFullAnalysis", () => {
  beforeEach(() => {
    scrapeStockNewsMock.mockReset();
    fetchStockInfoMock.mockReset();
    analyzeMock.mockReset();
    // 恢复默认行为
    scrapeStockNewsMock.mockImplementation(() => Promise.resolve(DEFAULT_NEWS));
    fetchStockInfoMock.mockImplementation(() => Promise.resolve(null));
    analyzeMock.mockImplementation(() => Promise.resolve(DEFAULT_ANALYSIS));
  });

  test("正常路径返回包含 symbol、news、analysis 的完整响应", async () => {
    const result = await performFullAnalysis("AAPL", "openai", { apiKey: "sk-test" });
    expect(result.symbol).toBe("AAPL");
    expect(result.news).toHaveLength(1);
    expect(result.analysis.rating).toBe(80);
    expect(result.analysis.sentiment).toBe("bullish");
  });

  test("news 为空时抛出包含股票代码的错误信息", async () => {
    scrapeStockNewsMock.mockImplementation(() => Promise.resolve([]));
    await expect(performFullAnalysis("INVALID", "openai", {})).rejects.toThrow("INVALID");
  });

  test("fetchStockInfo 失败时 stockInfo 为 undefined，但流程正常完成", async () => {
    fetchStockInfoMock.mockImplementation(() => Promise.reject(new Error("网络超时")));
    const result = await performFullAnalysis("AAPL", "openai", { apiKey: "sk-test" });
    expect(result.stockInfo).toBeUndefined();
    expect(result.news).toHaveLength(1);
  });

  test("AI provider 抛出异常时降级返回 rating:50 的中性结果，不抛出", async () => {
    analyzeMock.mockImplementation(() => Promise.reject(new Error("API Key 无效")));
    const result = await performFullAnalysis("AAPL", "openai", { apiKey: "invalid" });
    expect(result.analysis.rating).toBe(50);
    expect(result.analysis.sentiment).toBe("neutral");
    expect(result.analysis.summary).toContain("AI 分析服务暂不可用");
  });
});
