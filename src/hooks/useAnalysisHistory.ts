import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisRecordSummary, AnalysisType } from '../../shared/types';
import { getAnalysisHistory, deleteAnalysisRecords } from '../lib/db';

const PAGE_SIZE = 20;

export interface UseAnalysisHistoryResult {
  records: AnalysisRecordSummary[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  remove: (ids: number[]) => Promise<void>;
  refresh: () => void;
}

export function useAnalysisHistory(
  symbol: string,
  analysisType?: AnalysisType,
): UseAnalysisHistoryResult {
  const [records, setRecords] = useState<AnalysisRecordSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const activeRef = useRef(true);

  const load = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const rows = await getAnalysisHistory({
          symbol,
          analysisType,
          limit: PAGE_SIZE,
          offset,
        });
        if (!activeRef.current) return;
        setRecords((prev) => (append ? [...prev, ...rows] : rows));
        setHasMore(rows.length === PAGE_SIZE);
        offsetRef.current = offset + rows.length;
      } catch (e) {
        console.error('加载分析历史失败:', e);
      } finally {
        if (activeRef.current) setLoading(false);
      }
    },
    [symbol, analysisType],
  );

  useEffect(() => {
    activeRef.current = true;
    offsetRef.current = 0;
    setRecords([]);
    setHasMore(true);
    load(0, false);
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    load(offsetRef.current, true);
  }, [loading, hasMore, load]);

  const remove = useCallback(async (ids: number[]) => {
    await deleteAnalysisRecords(ids);
    setRecords((prev) => prev.filter((r) => !ids.includes(r.id)));
  }, []);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    load(0, false);
  }, [load]);

  return { records, loading, hasMore, loadMore, remove, refresh };
}
