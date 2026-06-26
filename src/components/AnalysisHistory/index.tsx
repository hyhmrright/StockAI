import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { useAnalysisHistory } from '../../hooks/useAnalysisHistory';
import HistoryTimeline from './HistoryTimeline';
import HistoryDetailModal from './HistoryDetailModal';
import type { AnalysisRecordSummary } from '../../../shared/types';

interface AnalysisHistoryProps {
  symbol: string;
}

const AnalysisHistory: React.FC<AnalysisHistoryProps> = ({ symbol }) => {
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { records, loading, hasMore, loadMore, remove, refresh } = useAnalysisHistory(symbol);

  function handleSelect(record: AnalysisRecordSummary) {
    setDetailId(record.id);
  }

  async function handleDelete(ids: number[]) {
    await remove(ids);
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        title="分析历史"
      >
        <Clock className="w-3.5 h-3.5" />
        历史
      </button>

      {open && (
        <div className="mt-4 mb-6 p-4 bg-white/5 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">分析历史</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <HistoryTimeline
            records={records}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
        </div>
      )}

      <HistoryDetailModal recordId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
};

export default AnalysisHistory;
