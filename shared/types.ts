// 跨层共享的数据类型定义（前端 + Sidecar 的唯一来源）

/** AI 服务提供商类型（跨 Rust / Sidecar / 前端共用） */
export type ProviderType = "openai" | "ollama" | "anthropic" | "deepseek";

/**
 * 股票新闻数据接口
 */
export interface StockNews {
  title: string;   // 新闻标题
  source: string;  // 新闻来源
  date: string;    // 发布日期
  content: string; // 新闻内容 (Markdown 格式)
  url: string;     // 新闻链接
}

/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  rating: number; // 1-100 分
  sentiment: 'bullish' | 'bearish' | 'neutral'; // 情绪：看涨、看跌、中性
  summary: string; // 简要总结
  pros: string[]; // 利多理由
  cons: string[]; // 利空/风险因素
}

/**
 * 股票基本信息（来自 Sina Finance / Yahoo Finance）
 */
export interface StockInfo {
  name: string;            // 股票全称
  code: string;            // 标准化代码（如 688693）
  exchange: string;        // 交易所名称（科创板 / 上交所 / 深交所 / 北交所 / NASDAQ / NYSE）
  market: string;          // 市场（A股 / 美股）
  price?: number;          // 最新价
  change?: number;         // 涨跌额
  changePercent?: number;  // 涨跌幅 %
  currency: string;        // 货币（CNY / USD）
}

/**
 * 完整的股票分析响应
 */
export interface FullAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
  analysis: AIAnalysisResult;
}
