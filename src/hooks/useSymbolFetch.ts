import { useEffect, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n';
import { formatServiceError } from '../lib/service-errors';
import { useLanguage } from './useLanguage';

/** 按 symbol 抓取的四态机——所有数据层 hook 共用同一口径，不要各自再定义一份 */
export type AsyncStep = 'idle' | 'fetching' | 'ready' | 'error';

export interface UseSymbolFetchResult<T> {
  step: AsyncStep;
  data: T | null;
  error: string | null;
  refetch: () => void;
}

/**
 * 按 symbol 自动抓取的通用数据层 hook。
 *
 * - symbol 变化自动重抓，refetch() 手动重抓
 * - requestId 竞态守卫：旧请求晚回时不覆盖新 symbol 的数据
 * - fetcher 存 ref 且**不进依赖数组**：调用方传内联函数也不会触发无限重抓循环
 *   （这正是 useStockData / useQuantData 各写一份时漂移出的分歧）
 * - 错误统一经 formatServiceError 本地化，调用方只需给一个兜底 i18n key
 */
export function useSymbolFetch<T>(
  symbol: string,
  fetcher: (symbol: string) => Promise<T>,
  errorFallbackKey: TranslationKey,
): UseSymbolFetchResult<T> {
  const { t } = useLanguage();
  const [step, setStep] = useState<AsyncStep>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const [trigger, setTrigger] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // t 走 ref 而非 deps：它只在 catch 里用，为切语言重跑整条抓取链不值当
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!symbol) return;

    const requestId = ++latestRequestId.current;
    setStep('fetching');
    setError(null);

    fetcherRef
      .current(symbol)
      .then((value) => {
        if (requestId !== latestRequestId.current) return;
        setData(value);
        setStep('ready');
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        setError(formatServiceError(err, tRef.current, errorFallbackKey));
        setStep('error');
        // 失败时清空旧数据，避免与新 symbol 的错误信息错配
        setData(null);
      });
  }, [symbol, trigger, errorFallbackKey]);

  function refetch() {
    setTrigger((t) => t + 1);
  }

  return { step, data, error, refetch };
}
