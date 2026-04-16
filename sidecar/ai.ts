import type { AIAnalysisResult, StockNews } from '../shared/types';

/** Provider 家族标识——工厂派发结果可被单测断言 */
export type ProviderKind = 'openai' | 'ollama' | 'anthropic';

/**
 * AI 提供者接口
 */
export interface AIProvider {
  /** 底层 SDK 家族（同家族可共用，如 deepseek 走 OpenAI 兼容协议） */
  readonly kind: ProviderKind;

  /**
   * 分析股票及其相关新闻
   * @param symbol 股票代码
   * @param news 相关新闻列表
   */
  analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult>;
}
