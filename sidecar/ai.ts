/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  rating: number; // 1-100 分
  sentiment: 'bullish' | 'bearish' | 'neutral'; // 情绪：看涨、看跌、中性
  summary: string; // 简要总结
  pros: string[]; // 优点/看涨理由
  cons: string[]; // 缺点/看跌理由
}

/**
 * AI 提供者接口
 */
export interface AIProvider {
  /**
   * 分析股票及其相关新闻
   * @param symbol 股票代码
   * @param news 相关新闻列表
   */
  analyze(symbol: string, news: any[]): Promise<AIAnalysisResult>;
}
