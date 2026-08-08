import { useEffect, useRef, useState } from 'react';

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
 */
export function useSymbolFetch<T>(
  symbol: string,
  fetcher: (symbol: string) => Promise<T>,
  errorFallback: string,
): UseSymbolFetchResult<T> {
  const [step, setStep] = useState<AsyncStep>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const [trigger, setTrigger] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

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
        setError(err instanceof Error ? err.message : errorFallback);
        setStep('error');
        // 失败时清空旧数据，避免与新 symbol 的错误信息错配
        setData(null);
      });
  }, [symbol, trigger, errorFallback]);

  function refetch() {
    setTrigger((t) => t + 1);
  }

  return { step, data, error, refetch };
}
