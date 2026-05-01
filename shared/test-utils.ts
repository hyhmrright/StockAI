import type { FullAnalysisResponse, StockInfo, StockNews, AIAnalysisResult } from './types';

/**
 * 模拟新闻数据工厂
 */
export function createMockNews(overrides: Partial<StockNews> = {}): StockNews {
  return {
    title: "测试新闻",
    source: "Test Source",
    date: "2025-01-01",
    content: "这是一段测试新闻正文内容。",
    url: "https://example.com/news/1",
    ...overrides
  };
}

/**
 * 模拟 AI 分析结果工厂
 */
export function createMockAIResult(overrides: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
  return {
    rating: 80,
    sentiment: 'bullish',
    summary: "看涨总结",
    pros: ["利多因素 1"],
    cons: ["利空因素 1"],
    ...overrides
  };
}

/**
 * 模拟股票信息工厂
 */
export function createMockStockInfo(overrides: Partial<StockInfo> = {}): StockInfo {
  return {
    name: "测试股票",
    code: "601012",
    exchange: "上交所",
    market: "A股",
    currency: "CNY",
    price: 100,
    ...overrides
  };
}

/**
 * 模拟完整分析响应工厂
 */
export function createMockAnalysisResponse(overrides: Partial<FullAnalysisResponse> = {}): FullAnalysisResponse {
  return {
    symbol: "601012",
    news: [createMockNews()],
    analysis: createMockAIResult(),
    stockInfo: createMockStockInfo(),
    ...overrides
  };
}
