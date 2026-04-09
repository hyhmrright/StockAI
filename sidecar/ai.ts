import type { AIAnalysisResult, StockNews } from '../shared/types';

// 从共享定义重新导出
export type { AIAnalysisResult } from '../shared/types';

/**
 * AI 提供者接口
 */
export interface AIProvider {
  /**
   * 分析股票及其相关新闻
   * @param symbol 股票代码
   * @param news 相关新闻列表
   */
  analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult>;
}
