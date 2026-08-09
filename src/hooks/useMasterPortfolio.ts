import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterPortfolioData } from '../../shared/types';
import { getAllMasterSignals } from '../lib/db';
import { fetchRealtimeQuotes } from '../lib/ipc';
import {
  loadMasterPortfolio,
  type PriceFetcher,
  type SignalsFetcher,
} from '../lib/masterPortfolio';
import { useLanguage } from './useLanguage';
import { formatServiceError } from '../lib/service-errors';

export type MasterPortfolioStep = 'idle' | 'loading' | 'ready' | 'error';

export interface UseMasterPortfolioResult {
  step: MasterPortfolioStep;
  data: MasterPortfolioData | null;
  error: string | null;
  refetch: () => void;
}

/** 一次进程拉完整组；symbol 数没有上限，逐只取价会按标的数放大 sidecar 进程数 */
const defaultPriceFetcher: PriceFetcher = async (symbols) => {
  const { quotes } = await fetchRealtimeQuotes(symbols);
  return Object.fromEntries(Object.entries(quotes).map(([sym, q]) => [sym, q.price]));
};

/**
 * 虚拟大师组合战绩 hook：读全量落账 signal → 按 symbol 回查现价 → 纯函数聚合。
 * 懒加载：仅 enabled 为 true 时拉取（面板展开才付出报价请求成本）。
 * 报价按 symbol 去重并发拉取，失败的 symbol 静默跳过（对应 signal 计入「待定」）。
 */
export function useMasterPortfolio(
  enabled: boolean,
  loadSignals: SignalsFetcher = getAllMasterSignals,
  loadPrice: PriceFetcher = defaultPriceFetcher,
): UseMasterPortfolioResult {
  const [step, setStep] = useState<MasterPortfolioStep>('idle');
  const [data, setData] = useState<MasterPortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const latestRequestId = useRef(0);
  const fns = useRef({ loadSignals, loadPrice });
  fns.current = { loadSignals, loadPrice };
  const { t } = useLanguage();

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++latestRequestId.current;
    setStep('loading');
    setError(null);

    loadMasterPortfolio(fns.current.loadSignals, fns.current.loadPrice)
      .then((result) => {
        if (requestId !== latestRequestId.current) return;
        setData(result);
        setStep('ready');
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        setError(formatServiceError(err, t, 'portfolio_load_error'));
        setStep('error');
      });
    // t 有意不入 deps：它只用于 catch 的兜底文案，为翻译一句错误提示而重跑整个组合加载不值当
  }, [enabled, trigger]);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  return { step, data, error, refetch };
}
