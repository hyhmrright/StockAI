import { MarketBundle, StockInfo, StockNews } from '../../shared/types';
import { fetchMarketBundle } from '../lib/ipc';
import { type AsyncStep, useSymbolFetch } from './useSymbolFetch';
import { useLanguage } from './useLanguage';

export type StockDataStep = AsyncStep;

export interface UseStockDataResult {
  step: StockDataStep;
  stockInfo: StockInfo | undefined;
  news: StockNews[];
  error: string | null;
}

type FetchFn = (symbol: string) => Promise<MarketBundle>;

/**
 * 数据层：拉取 StockInfo + News，但不调用 LLM。
 * symbol 变化自动重抓与竞态守卫由 useSymbolFetch 统一提供。
 */
export function useStockData(
  symbol: string,
  fetcher: FetchFn = fetchMarketBundle,
): UseStockDataResult {
  const { t } = useLanguage();
  const { step, data, error } = useSymbolFetch<MarketBundle>(
    symbol,
    fetcher,
    t('data_fetch_error'),
  );

  return {
    step,
    stockInfo: data?.stockInfo,
    news: data?.news ?? [],
    error,
  };
}
