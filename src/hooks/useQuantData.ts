import { useEffect, useRef, useState } from 'react';
import type { QuantBundle } from '../../shared/types';
import { fetchQuantBundle } from '../lib/ipc';

export type QuantDataStep = 'idle' | 'fetching' | 'ready' | 'error';

export interface UseQuantDataResult {
  step: QuantDataStep;
  quant: QuantBundle | null;
  error: string | null;
  refetch: () => void;
}

type FetchFn = (symbol: string) => Promise<QuantBundle>;

export function useQuantData(
  symbol: string,
  fetcher: FetchFn = fetchQuantBundle,
): UseQuantDataResult {
  const [step, setStep] = useState<QuantDataStep>('idle');
  const [quant, setQuant] = useState<QuantBundle | null>(null);
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
      .then((bundle) => {
        if (requestId !== latestRequestId.current) return;
        setQuant(bundle);
        setStep('ready');
      })
      .catch((err) => {
        if (requestId !== latestRequestId.current) return;
        const msg = err instanceof Error ? err.message : '量化分析失败';
        setError(msg);
        setStep('error');
        setQuant(null);
      });
  }, [symbol, trigger]);

  function refetch() {
    setTrigger((t) => t + 1);
  }

  return { step, quant, error, refetch };
}
