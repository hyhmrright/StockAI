import { useCallback } from 'react';
import type {
  DeepAnalysisResult,
  StockNews,
  QuantBundle,
  MasterWeightInput,
} from '../../shared/types';
import { deepAnalyze } from '../lib/ipc';
import { useLanguage } from './useLanguage';
import { useSymbolScopedAsync } from './useSymbolScopedAsync';

export interface UseDeepAnalysisResult {
  result: DeepAnalysisResult | null;
  analyzing: boolean;
  error: string | null;
  analyze: (news: StockNews[], quant?: QuantBundle, weights?: MasterWeightInput[]) => Promise<void>;
}

type DeepAnalyzeFn = (
  symbol: string,
  news: StockNews[],
  quant?: QuantBundle,
  weights?: MasterWeightInput[],
) => Promise<DeepAnalysisResult>;

/**
 * 深度分析结果按 symbol + 配置指纹缓存。
 * configFingerprint 应包含 provider/model/大师/语言——任一变化即令缓存失效，
 * 避免切回同一股票时显示用旧 provider/旧大师跑出的陈旧结果。
 */
export function useDeepAnalysis(
  symbol: string,
  configFingerprint = '',
  runner: DeepAnalyzeFn = deepAnalyze,
): UseDeepAnalysisResult {
  const store = useSymbolScopedAsync<DeepAnalysisResult>();
  const { t } = useLanguage();
  const cacheKey = `${symbol}::${configFingerprint}`;

  const analyze = useCallback(
    async (news: StockNews[], quant?: QuantBundle, weights?: MasterWeightInput[]) => {
      if (!symbol) return;
      const key = `${symbol}::${configFingerprint}`;
      if (news.length === 0) {
        store.setError(key, t('no_news_to_analyze'));
        return;
      }

      await store.run(key, () => runner(symbol, news, quant, weights));
    },
    [symbol, configFingerprint, runner, store, t],
  );

  return {
    result: store.get(cacheKey),
    analyzing: store.isRunning(cacheKey),
    error: store.errorOf(cacheKey),
    analyze,
  };
}
