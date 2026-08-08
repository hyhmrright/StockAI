import { useEffect, useRef } from 'react';
import { indexReports } from '../lib/ipc';

type WarmupFn = (symbol: string) => Promise<void>;

/**
 * 财报 RAG 预热：切到某只股票时提前建索引，把交易所互动平台的抓取挪出 chat 首答的关键路径。
 *
 * 严格 fire-and-forget——不返回任何状态、不阻塞任何渲染、失败只在 ipc 层留一条 warn。
 * 每个 symbol 每次会话只预热一次（索引本身在 sidecar 侧有磁盘缓存，重复调用是纯浪费）。
 */
export function useReportIndexWarmup(symbol: string, warmup: WarmupFn = indexReports): void {
  const warmedRef = useRef<Set<string>>(new Set());
  const warmupRef = useRef(warmup);
  warmupRef.current = warmup;

  useEffect(() => {
    if (!symbol || warmedRef.current.has(symbol)) return;
    warmedRef.current.add(symbol);
    void warmupRef.current(symbol);
  }, [symbol]);
}
