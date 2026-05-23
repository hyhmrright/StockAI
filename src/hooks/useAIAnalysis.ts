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

/** cache/error Map 容量上限，超出按插入顺序淘汰最旧条目 */
export const MAX_SYMBOLS_IN_CACHE = 50;

/**
 * 按插入顺序淘汰最旧 key 的 Map.set 包装（容量已满且 key 不存在时触发淘汰）。
 * JS Map 天然保持插入顺序，keys().next() 即最旧条目；命中已有 key 不重排序。
 * 这是 LRI（Least Recently Inserted），不是严格 LRU，但与"最近分析过的 symbol 最可能再用"语义吻合。
 */
function setWithLRI<V>(map: Map<string, V>, key: string, value: V, capacity: number): void {
  if (!map.has(key) && map.size >= capacity) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

/**
 * AI 分析层：显式触发、按 symbol 维度隔离状态。
 *
 * 关键设计：record / error / analyzing / requestId 都按 symbol 分桶，
 * 避免 AAPL 出错或在跑时，切到 MSFT 仍看到 AAPL 的错误/分析中状态；
 * 也避免跨 symbol race id 互相挤掉缓存写入。
 *
 * 内存：cacheRef/errorRef 容量上限 MAX_SYMBOLS_IN_CACHE，长会话也不会无界增长。
 * inFlightRef/reqIdRef 生命短（跟随单次分析），无需上限。
 */
export function useAIAnalysis(symbol: string, runner: AnalyzeFn = analyzeNews): UseAIAnalysisResult {
  const cacheRef = useRef<Map<string, AIAnalysisRecord>>(new Map());
  const errorRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  // 每个 symbol 自己的 requestId 计数器，互不干扰；并发跨 symbol 分析也能各自正确落盘
  const reqIdRef = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);

  const analyze = useCallback(async (news: StockNews[]) => {
    if (!symbol) return;
    if (news.length === 0) {
      setWithLRI(errorRef.current, symbol, "尚未抓到新闻，无法分析。请等待数据加载完成后再点击。", MAX_SYMBOLS_IN_CACHE);
      force(n => n + 1);
      return;
    }

    const myReqId = (reqIdRef.current.get(symbol) ?? 0) + 1;
    reqIdRef.current.set(symbol, myReqId);

    inFlightRef.current.add(symbol);
    errorRef.current.delete(symbol);
    force(n => n + 1);

    try {
      const result = await runner(symbol, news);
      if (reqIdRef.current.get(symbol) !== myReqId) return;
      setWithLRI(cacheRef.current, symbol, {
        result,
        analyzedAt: Date.now(),
        newsSnapshotLength: news.length,
      }, MAX_SYMBOLS_IN_CACHE);
    } catch (err) {
      if (reqIdRef.current.get(symbol) !== myReqId) return;
      const msg = err instanceof Error ? err.message : "AI 分析失败";
      setWithLRI(errorRef.current, symbol, msg, MAX_SYMBOLS_IN_CACHE);
    } finally {
      // 仅当本请求仍是该 symbol 的最新一次，才清 inFlight 并触发 UI 更新；
      // stale 请求没有写任何状态，跳过 force 节省一次空渲染。
      if (reqIdRef.current.get(symbol) === myReqId) {
        inFlightRef.current.delete(symbol);
        force(n => n + 1);
      }
    }
  }, [symbol, runner]);

  return {
    record: cacheRef.current.get(symbol) ?? null,
    analyzing: inFlightRef.current.has(symbol),
    error: errorRef.current.get(symbol) ?? null,
    analyze,
  };
}
