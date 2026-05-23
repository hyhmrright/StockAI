import { useCallback, useRef, useState } from "react";
import { AIAnalysisResult, StockNews } from "../../shared/types";
import { analyzeNews } from "../lib/ipc";

export interface AIAnalysisRecord {
  result: AIAnalysisResult;
  analyzedAt: number;       // Unix ms 时间戳，用于"分析时间：xx 前"提示
  newsSnapshotLength: number; // 当时的新闻条数，便于判断是否需要重跑
}

export interface UseAIAnalysisResult {
  /** 当前 symbol 上次分析快照（null 表示尚未分析过） */
  record: AIAnalysisRecord | null;
  analyzing: boolean;
  error: string | null;
  /** 显式触发 LLM 分析；传入 news 用最新抓到的 */
  analyze: (news: StockNews[]) => Promise<void>;
}

type AnalyzeFn = (symbol: string, news: StockNews[]) => Promise<AIAnalysisResult>;

/**
 * AI 分析层：显式触发、按 symbol 缓存最近一次结果。
 * 切换 symbol 时切到对应缓存（无缓存则 null），不会自动触发 LLM。
 */
export function useAIAnalysis(symbol: string, runner: AnalyzeFn = analyzeNews): UseAIAnalysisResult {
  // 按 symbol 维度的结果缓存——用 ref 而非 state，避免每次切 symbol 触发整树渲染
  const cacheRef = useRef<Map<string, AIAnalysisRecord>>(new Map());
  const [, force] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestId = useRef(0);

  const analyze = useCallback(async (news: StockNews[]) => {
    if (!symbol) return;
    if (news.length === 0) {
      setError("尚未抓到新闻，无法分析。请等待数据加载完成后再点击。");
      return;
    }

    const requestId = ++latestRequestId.current;
    setAnalyzing(true);
    setError(null);

    try {
      const result = await runner(symbol, news);
      if (requestId !== latestRequestId.current) return;
      cacheRef.current.set(symbol, {
        result,
        analyzedAt: Date.now(),
        newsSnapshotLength: news.length,
      });
      // 触发渲染让消费者看到最新 record
      force(n => n + 1);
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      const msg = err instanceof Error ? err.message : "AI 分析失败";
      setError(msg);
    } finally {
      if (requestId === latestRequestId.current) setAnalyzing(false);
    }
  }, [symbol, runner]);

  return {
    record: cacheRef.current.get(symbol) ?? null,
    analyzing,
    error,
    analyze,
  };
}
