import React, { useState } from 'react';
import { Trash2, Loader2, ChevronDown } from 'lucide-react';
import type { AnalysisRecordSummary, AnalysisType } from '../../../shared/types';

const TYPE_LABELS: Record<AnalysisType, { text: string; color: string }> = {
  ai: { text: 'AI', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  deep: { text: '深度', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  quant: { text: '量化', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  backtest: { text: '回测', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ms).toLocaleDateString('zh-CN');
}

function extractSummary(record: AnalysisRecordSummary): string {
  try {
    const data = JSON.parse(record.resultJson);
    switch (record.type) {
      case 'ai':
        return `${data.sentiment ?? '—'} · 评分 ${data.rating ?? '—'}`;
      case 'deep':
        return `${data.synthesis?.signal ?? '—'} · 共识 ${data.synthesis?.consensus ?? '—'}%`;
      case 'quant':
        return `${data.composite?.signal ?? '—'} · 评分 ${data.composite?.score ?? '—'}`;
      case 'backtest':
        return `收益 ${((data.totalReturn ?? 0) * 100).toFixed(1)}% · 胜率 ${((data.winRate ?? 0) * 100).toFixed(0)}%`;
      default:
        return '';
    }
  } catch {
    return '';
  }
}

interface HistoryTimelineProps {
  records: AnalysisRecordSummary[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (record: AnalysisRecordSummary) => void;
  onDelete: (ids: number[]) => void;
}

const HistoryTimeline: React.FC<HistoryTimelineProps> = ({
  records, loading, hasMore, onLoadMore, onSelect, onDelete,
}) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    onDelete(ids);
    setSelected(new Set());
  }

  if (records.length === 0 && !loading) {
    return <p className="text-xs text-gray-500 text-center py-8">暂无历史分析记录</p>;
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 mb-2 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          删除已选 ({selected.size})
        </button>
      )}

      {records.map(record => {
        const typeInfo = TYPE_LABELS[record.type];
        return (
          <div
            key={record.id}
            onClick={() => onSelect(record)}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-emerald-500/20 cursor-pointer transition-all group"
          >
            <input
              type="checkbox"
              checked={selected.has(record.id)}
              onClick={e => toggleSelect(record.id, e)}
              onChange={() => {}}
              className="w-3.5 h-3.5 rounded accent-emerald-500 shrink-0 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${typeInfo.color}`}>
                  {typeInfo.text}
                </span>
                <span className="text-[10px] text-gray-500">{formatRelativeTime(record.analyzedAt)}</span>
              </div>
              <p className="text-xs text-gray-400 truncate">{extractSummary(record)}</p>
            </div>
          </div>
        );
      })}

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      )}

      {hasMore && !loading && (
        <button
          onClick={onLoadMore}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          <ChevronDown className="w-3 h-3" />
          加载更多
        </button>
      )}
    </div>
  );
};

export default HistoryTimeline;
