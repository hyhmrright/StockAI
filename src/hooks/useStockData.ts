import { useEffect, useRef, useState } from 'react';
import { MarketBundle, StockInfo, StockNews } from '../../shared/types';
import { fetchMarketBundle } from '../lib/ipc';

export type StockDataStep = 'idle' | 'fetching' | 'ready' | 'error';

export interface UseStockDataResult {
  step: StockDataStep;
  stockInfo: StockInfo | undefined;
  news: StockNews[];
  error: string | null;
  refetch: () => void;
}

type FetchFn = (symbol: string) => Promise<MarketBundle>;

/**
 * 数据层：拉取 StockInfo + News，但不调用 LLM。
 * - symbol 变化自动重新抓取
 * - requestId 防止旧请求覆盖新数据（参考 useAnalysis 的竞态防护）
 */
export function useStockData(
  symbol: string,
  fetcher: FetchFn = fetchMarketBundle,
): UseStockDataResult {
  const [step, setStep] = useState<StockDataStep>('idle');
  const [stockInfo, setStockInfo] = useState<StockInfo | undefined>(undefined);
  const [news, setNews] = useState<StockNews[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!symbol) return;

    const requestId = ++latestRequestId.current;
    setStep('fetching');
    setError(null);

    fetcher(symbol)
      .then((bundle) => {
        if (requestId !== latestRequestId.current) return;
        setStockInfo(bundle.stockInfo);
        setNews(bundle.news);
        setStep('ready');
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        const msg = err instanceof Error ? err.message : '拉取股票数据失败';
        setError(msg);
        setStep('error');
        // 切换到失败时清空旧数据，避免与新 symbol 的错误信息错配
        setStockInfo(undefined);
        setNews([]);
      });
  }, [symbol, trigger, fetcher]);

  function refetch() {
    setTrigger((t) => t + 1);
  }

  return { step, stockInfo, news, error, refetch };
}
