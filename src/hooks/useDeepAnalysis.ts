import { useCallback, useEffect, useRef, useState } from "react";
import type { DeepAnalysisResult, StockNews, QuantBundle } from "../../shared/types";
import { deepAnalyze } from "../lib/ipc";

export interface UseDeepAnalysisResult {
  result: DeepAnalysisResult | null;
  analyzing: boolean;
  error: string | null;
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
}

export function useDeepAnalysis(symbol: string): UseDeepAnalysisResult {
  const [result, setResult] = useState<DeepAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<string>('');

  useEffect(() => {
    setResult(null);
    setError(null);
    setAnalyzing(false);
  }, [symbol]);

  const analyze = useCallback(async (news: StockNews[], quant?: QuantBundle) => {
    if (!symbol || news.length === 0) {
      setError('尚未抓到新闻，无法进行深度分析。');
      return;
    }
    const id = symbol;
    abortRef.current = id;
    setAnalyzing(true);
    setError(null);

    try {
      const data = await deepAnalyze(symbol, news, quant);
      if (abortRef.current === id) setResult(data);
    } catch (err) {
      if (abortRef.current === id) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === id) setAnalyzing(false);
    }
  }, [symbol]);

  return { result, analyzing, error, analyze };
}
