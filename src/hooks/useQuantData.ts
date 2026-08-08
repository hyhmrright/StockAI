import type { QuantBundle } from '../../shared/types';
import { fetchQuantBundle } from '../lib/ipc';
import { type AsyncStep, useSymbolFetch } from './useSymbolFetch';
import { useLanguage } from './useLanguage';

export type QuantDataStep = AsyncStep;

export interface UseQuantDataResult {
  step: QuantDataStep;
  quant: QuantBundle | null;
  error: string | null;
}

type FetchFn = (symbol: string) => Promise<QuantBundle>;

/** 数据层：量化四维评分。抓取语义与 useStockData 完全一致，共用 useSymbolFetch。 */
export function useQuantData(
  symbol: string,
  fetcher: FetchFn = fetchQuantBundle,
): UseQuantDataResult {
  const { t } = useLanguage();
  const { step, data, error } = useSymbolFetch<QuantBundle>(symbol, fetcher, t('quant_error'));

  return { step, quant: data, error };
}
