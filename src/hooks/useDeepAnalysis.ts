import { useCallback, useRef, useState } from 'react';
import type { DeepAnalysisResult, StockNews, QuantBundle } from '../../shared/types';
import { deepAnalyze } from '../lib/ipc';
import { MAX_SYMBOLS_IN_CACHE, setWithLRI } from './cache-utils';

export interface UseDeepAnalysisResult {
  result: DeepAnalysisResult | null;
  analyzing: boolean;
  error: string | null;
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
}

type DeepAnalyzeFn = (
  symbol: string,
  news: StockNews[],
  quant?: QuantBundle,
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
  const cacheRef = useRef<Map<string, DeepAnalysisResult>>(new Map());
  const errorRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const reqIdRef = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);

  const cacheKey = `${symbol}::${configFingerprint}`;

  const analyze = useCallback(
    async (news: StockNews[], quant?: QuantBundle) => {
      if (!symbol) return;
      const key = `${symbol}::${configFingerprint}`;
      if (news.length === 0) {
        setWithLRI(
          errorRef.current,
          key,
          '尚未抓到新闻，无法分析。请等待数据加载完成后再点击。',
          MAX_SYMBOLS_IN_CACHE,
        );
        force((n) => n + 1);
        return;
      }

      const myReqId = (reqIdRef.current.get(key) ?? 0) + 1;
      reqIdRef.current.set(key, myReqId);

      inFlightRef.current.add(key);
      errorRef.current.delete(key);
      force((n) => n + 1);

      try {
        const data = await runner(symbol, news, quant);
        if (reqIdRef.current.get(key) !== myReqId) return;
        setWithLRI(cacheRef.current, key, data, MAX_SYMBOLS_IN_CACHE);
      } catch (err) {
        if (reqIdRef.current.get(key) !== myReqId) return;
        setWithLRI(
          errorRef.current,
          key,
          err instanceof Error ? err.message : String(err),
          MAX_SYMBOLS_IN_CACHE,
        );
      } finally {
        if (reqIdRef.current.get(key) === myReqId) {
          inFlightRef.current.delete(key);
          force((n) => n + 1);
        }
      }
    },
    [symbol, configFingerprint, runner],
  );

  return {
    result: cacheRef.current.get(cacheKey) ?? null,
    analyzing: inFlightRef.current.has(cacheKey),
    error: errorRef.current.get(cacheKey) ?? null,
    analyze,
  };
}
