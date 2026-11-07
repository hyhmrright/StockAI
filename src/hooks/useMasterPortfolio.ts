import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterPortfolioData } from '../../shared/types';
import { getAllMasterSignals } from '../lib/db';
import { loadMasterHistory } from '../lib/master-history';
import {
  loadMasterEvaluation,
  type SignalsFetcher,
  type HistoryFetcher,
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

/**
 * 虚拟大师组合战绩 hook：读全量落账 signal → 按 symbol 读取历史 K 线 → 纯函数聚合。
 * 懒加载：仅 enabled 为 true 时拉取（面板展开才付出报价请求成本）。
 * 报价按 symbol 去重并发拉取，失败的 symbol 静默跳过（对应 signal 计入「待定」）。
 */
export function useMasterPortfolio(
  enabled: boolean,
  loadSignals: SignalsFetcher = getAllMasterSignals,
  loadHistory: HistoryFetcher = loadMasterHistory,
): UseMasterPortfolioResult {
  const [step, setStep] = useState<MasterPortfolioStep>('idle');
  const [data, setData] = useState<MasterPortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const latestRequestId = useRef(0);
  const fns = useRef({ loadSignals, loadHistory });
  fns.current = { loadSignals, loadHistory };
  const { t } = useLanguage();

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++latestRequestId.current;
    setStep('loading');
    setError(null);

    loadMasterEvaluation(fns.current.loadSignals, fns.current.loadHistory)
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
