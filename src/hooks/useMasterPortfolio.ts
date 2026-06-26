import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterSignalRecord, MasterPortfolioData } from '../../shared/types';
import { getAllMasterSignals } from '../lib/db';
import { fetchRealtimeQuote } from '../lib/ipc';
import { computeMasterPortfolio } from '../lib/masterPortfolio';

export type MasterPortfolioStep = 'idle' | 'loading' | 'ready' | 'error';

export interface UseMasterPortfolioResult {
  step: MasterPortfolioStep;
  data: MasterPortfolioData | null;
  error: string | null;
  refetch: () => void;
}

type SignalsFetcher = () => Promise<MasterSignalRecord[]>;
type PriceFetcher = (symbol: string) => Promise<number>;

const defaultPriceFetcher: PriceFetcher = async (symbol) =>
  (await fetchRealtimeQuote(symbol)).price;

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

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++latestRequestId.current;
    setStep('loading');
    setError(null);

    (async () => {
      const signals = await fns.current.loadSignals();
      // 按 symbol 去重并发回查现价，失败者跳过
      const symbols = [...new Set(signals.map((s) => s.symbol))];
      const quotes = await Promise.allSettled(symbols.map((sym) => fns.current.loadPrice(sym)));
      const priceMap: Record<string, number> = {};
      symbols.forEach((sym, i) => {
        const q = quotes[i];
        if (q.status === 'fulfilled' && Number.isFinite(q.value)) priceMap[sym] = q.value;
      });
      return computeMasterPortfolio(signals, priceMap, Date.now());
    })()
      .then((result) => {
        if (requestId !== latestRequestId.current) return;
        setData(result);
        setStep('ready');
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        setError(err instanceof Error ? err.message : '战绩加载失败');
        setStep('error');
      });
  }, [enabled, trigger]);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  return { step, data, error, refetch };
}
