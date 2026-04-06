/**
 * 股票新闻数据接口 (DTO)
 */
export interface StockNews {
  title: string;
  source: string;
  date: string;
  content: string;
  url: string;
}

/**
 * AI 分析结果接口 (DTO)
 */
export interface AIAnalysisResult {
  rating: number; // 1-100 分
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  pros: string[];
  cons: string[];
}

/**
 * 完整的股票分析响应
 */
export interface FullAnalysisResponse {
  symbol: string;
  news: StockNews[];
  analysis: AIAnalysisResult;
}
