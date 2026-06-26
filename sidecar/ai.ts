import type { AIAnalysisResult, StockNews, QuantBundle, Language } from '../shared/types';

/** Provider 家族标识——工厂派发结果可被单测断言。
 * deepseek 复用 OpenAI 兼容协议，其 Provider 实例的 kind 为 'openai'，故不在此列。
 */
export type ProviderKind = 'openai' | 'ollama' | 'anthropic';

/**
 * AI 提供者接口
 */
export interface AIProvider {
  /** 底层 SDK 家族（同家族可共用，如 deepseek 走 OpenAI 兼容协议） */
  readonly kind: ProviderKind;

  analyze(
    symbol: string,
    news: StockNews[],
    quant?: QuantBundle,
    language?: Language,
  ): Promise<AIAnalysisResult>;
}

/** 各 Provider 实现统一使用此函数解析 language，缺省回落 zh */
export function resolveLanguage(language?: Language): Language {
  return language ?? 'zh';
}
