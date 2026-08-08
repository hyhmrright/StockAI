import type { QuantBundle } from '../../shared/types';
import { fetchQuantBundle } from '../lib/ipc';
import { type AsyncStep, useSymbolFetch } from './useSymbolFetch';

export type QuantDataStep = AsyncStep;

export interface UseQuantDataResult {
  step: QuantDataStep;
  quant: QuantBundle | null;
  error: string | null;
  refetch: () => void;
}

type FetchFn = (symbol: string) => Promise<QuantBundle>;

/** 数据层：量化四维评分。抓取语义与 useStockData 完全一致，共用 useSymbolFetch。 */
export function useQuantData(
  symbol: string,
  fetcher: FetchFn = fetchQuantBundle,
): UseQuantDataResult {
  const { step, data, error, refetch } = useSymbolFetch<QuantBundle>(
    symbol,
    fetcher,
    '量化分析失败',
  );

  return { step, quant: data, error, refetch };
}
