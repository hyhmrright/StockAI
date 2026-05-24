import { useCallback, useRef, useState } from "react";
import type { DeepAnalysisResult, StockNews, QuantBundle } from "../../shared/types";
import { deepAnalyze } from "../lib/ipc";
import { MAX_SYMBOLS_IN_CACHE, setWithLRI } from "./useAIAnalysis";

export interface UseDeepAnalysisResult {
  result: DeepAnalysisResult | null;
  analyzing: boolean;
  error: string | null;
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
}

type DeepAnalyzeFn = (symbol: string, news: StockNews[], quant?: QuantBundle) => Promise<DeepAnalysisResult>;

export function useDeepAnalysis(symbol: string, runner: DeepAnalyzeFn = deepAnalyze): UseDeepAnalysisResult {
  const cacheRef = useRef<Map<string, DeepAnalysisResult>>(new Map());
  const errorRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const reqIdRef = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);

  const analyze = useCallback(async (news: StockNews[], quant?: QuantBundle) => {
    if (!symbol) return;
    if (news.length === 0) {
      setWithLRI(errorRef.current, symbol, "尚未抓到新闻，无法进行深度分析。", MAX_SYMBOLS_IN_CACHE);
      force(n => n + 1);
      return;
    }

    const myReqId = (reqIdRef.current.get(symbol) ?? 0) + 1;
    reqIdRef.current.set(symbol, myReqId);

    inFlightRef.current.add(symbol);
    errorRef.current.delete(symbol);
    force(n => n + 1);

    try {
      const data = await runner(symbol, news, quant);
      if (reqIdRef.current.get(symbol) !== myReqId) return;
      setWithLRI(cacheRef.current, symbol, data, MAX_SYMBOLS_IN_CACHE);
    } catch (err) {
      if (reqIdRef.current.get(symbol) !== myReqId) return;
      setWithLRI(errorRef.current, symbol, err instanceof Error ? err.message : String(err), MAX_SYMBOLS_IN_CACHE);
    } finally {
      if (reqIdRef.current.get(symbol) === myReqId) {
        inFlightRef.current.delete(symbol);
        force(n => n + 1);
      }
    }
  }, [symbol, runner]);

  return {
    result: cacheRef.current.get(symbol) ?? null,
    analyzing: inFlightRef.current.has(symbol),
    error: errorRef.current.get(symbol) ?? null,
    analyze,
  };
}
