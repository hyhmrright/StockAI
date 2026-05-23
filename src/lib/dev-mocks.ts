import type {
  StockInfo,
  StockSearchResult,
  KlinePoint,
  RealtimeQuote,
  MarketBundle,
  StockNews,
  AIAnalysisResult,
} from "../../shared/types";

/**
 * Dev / 浏览器模式专用 mock 数据集合
 * 只在 `!isTauri()` 分支与 dev bridge 不在线时使用，生产桌面构建路径不会引用本文件。
 */

export const MOCK_STOCKS: StockSearchResult[] = [
  { name: "苹果公司", code: "AAPL", type: "美股", fullCode: "gb_aapl" },
  { name: "隆基绿能", code: "601012", type: "A股", fullCode: "sh601012" },
];

export const MOCK_STOCK_INFO: StockInfo = {
  name: "苹果公司",
  code: "AAPL",
  exchange: "NASDAQ",
  market: "美股",
  price: 180.5,
  change: 2.5,
  changePercent: 1.4,
  currency: "USD",
};

export const MOCK_MODELS: string[] = ["gpt-4o", "gpt-4o-mini", "ollama-dev"];

/** 30 根 1d 周期 K 线，最后一根对齐今天，便于与 quote 合并测试 */
export const MOCK_KLINE: KlinePoint[] = Array.from({ length: 30 }, (_, i) => {
  const base = 180 + Math.sin(i / 5) * 5;
  return {
    time: Math.floor(Date.now() / 1000) - (29 - i) * 86400,
    open: base,
    high: base + 2,
    low: base - 2,
    close: base + (Math.random() - 0.5) * 3,
    volume: 50_000_000 + Math.random() * 10_000_000,
  };
});

export const MOCK_NEWS: StockNews[] = [
  {
    title: "苹果发布会预告：M5 芯片性能再次跃迁",
    source: "TechCrunch",
    date: "2026-05-22",
    content: "（mock）苹果将于下周发布会上展示 M5 芯片，预计单核性能提升 25%。",
    url: "https://example.com/news/1",
  },
  {
    title: "AAPL Q2 财报超预期：服务业务首次突破 300 亿美元",
    source: "Reuters",
    date: "2026-05-21",
    content: "（mock）服务业务同比增长 18%，毛利率维持高位。",
    url: "https://example.com/news/2",
  },
];

export const MOCK_BUNDLE: MarketBundle = {
  symbol: "AAPL",
  stockInfo: MOCK_STOCK_INFO,
  news: MOCK_NEWS,
};

export const MOCK_AI_RESULT: AIAnalysisResult = {
  rating: 72,
  sentiment: "bullish",
  summary: "（mock）整体看涨：核心业务表现稳健，AI 战略推进顺利。",
  pros: ["服务业务增长", "M5 芯片亮点", "现金流充裕"],
  cons: ["大盘估值偏高", "中国市场不确定性"],
};

export const MOCK_QUOTE: RealtimeQuote = {
  symbol: "AAPL",
  name: "Apple Inc.",
  price: 180.5,
  change: 2.5,
  changePercent: 1.4,
  open: 179,
  high: 182,
  low: 178.5,
  prevClose: 178,
  volume: 55_000_000,
  amount: 9_900_000_000,
  high52w: 200,
  low52w: 150,
  timestamp: Math.floor(Date.now() / 1000),
  currency: "USD",
  market: "美股",
};
