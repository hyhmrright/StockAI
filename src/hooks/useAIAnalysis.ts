import { useCallback } from 'react';
import { AIAnalysisResult, StockNews, QuantBundle } from '../../shared/types';
import { analyzeNews } from '../lib/ipc';
import { MAX_SYMBOLS_IN_CACHE, setWithLRI } from './cache-utils';
import { useLanguage } from './useLanguage';
import { useSymbolScopedAsync } from './useSymbolScopedAsync';

export { MAX_SYMBOLS_IN_CACHE, setWithLRI };

export interface AIAnalysisRecord {
  result: AIAnalysisResult;
  analyzedAt: number; // Unix ms 时间戳，用于"分析时间：xx 前"提示
  newsSnapshotLength: number; // 当时的新闻条数，便于判断是否需要重跑
}

export interface UseAIAnalysisResult {
  /** 当前 symbol 上次分析快照（null 表示尚未分析过） */
  record: AIAnalysisRecord | null;
  analyzing: boolean;
  error: string | null;
  /** 显式触发 LLM 分析；传入 news 用最新抓到的，quant 可选 */
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
}

type AnalyzeFn = (
  symbol: string,
  news: StockNews[],
  quant?: QuantBundle,
) => Promise<AIAnalysisResult>;

/**
 * AI 分析层：显式触发、按 symbol 维度隔离状态。
 * 分桶、竞态守卫与限容由 useSymbolScopedAsync 统一提供。
 */
export function useAIAnalysis(
  symbol: string,
  runner: AnalyzeFn = analyzeNews,
): UseAIAnalysisResult {
  const store = useSymbolScopedAsync<AIAnalysisRecord>();
  const { t } = useLanguage();

  const analyze = useCallback(
    async (news: StockNews[], quant?: QuantBundle) => {
      if (!symbol) return;
      if (news.length === 0) {
        store.setError(symbol, t('no_news_to_analyze'));
        return;
      }

      await store.run(symbol, async () => {
        const result = await runner(symbol, news, quant);
        return { result, analyzedAt: Date.now(), newsSnapshotLength: news.length };
      });
    },
    [symbol, runner, store, t],
  );

  return {
    record: store.get(symbol),
    analyzing: store.isRunning(symbol),
    error: store.errorOf(symbol),
    analyze,
  };
}
