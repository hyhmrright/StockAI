import { useCallback, useRef, useState } from 'react';
import type { QuantBundle, ScreenerResult } from '../../shared/types';
import { fetchQuantBundle } from '../lib/ipc';
import type { WatchlistItem } from './useWatchlist';

const MAX_CONCURRENCY = 3;

export interface UseScreenerResult {
  results: ScreenerResult[];
  scanning: boolean;
  progress: { done: number; total: number };
  scan: (items: WatchlistItem[]) => void;
  clear: () => void;
}

type FetchFn = (symbol: string) => Promise<QuantBundle>;

export function useScreener(fetcher: FetchFn = fetchQuantBundle): UseScreenerResult {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const reqIdRef = useRef(0);

  const scan = useCallback(
    (items: WatchlistItem[]) => {
      if (items.length === 0) return;

      const myReqId = ++reqIdRef.current;
      setResults([]);
      setScanning(true);
      setProgress({ done: 0, total: items.length });

      const collected: ScreenerResult[] = [];
      let idx = 0;
      let done = 0;

      async function next() {
        while (idx < items.length) {
          const item = items[idx++];
          try {
            const quant = await fetcher(item.sym);
            if (reqIdRef.current !== myReqId) return;
            collected.push({ symbol: item.sym, name: item.name, quant });
          } catch (e) {
            console.error(`筛选器: ${item.sym} 失败:`, e);
          }
          if (reqIdRef.current !== myReqId) return;
          done++;
          const sorted = [...collected].sort(
            (a, b) => (b.quant.composite.score ?? 0) - (a.quant.composite.score ?? 0),
          );
          setResults(sorted);
          setProgress({ done, total: items.length });
        }
      }

      const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, () => next());
      Promise.all(workers).then(() => {
        if (reqIdRef.current === myReqId) setScanning(false);
      });
    },
    [fetcher],
  );

  const clear = useCallback(() => {
    reqIdRef.current++;
    setResults([]);
    setScanning(false);
    setProgress({ done: 0, total: 0 });
  }, []);

  return { results, scanning, progress, scan, clear };
}
