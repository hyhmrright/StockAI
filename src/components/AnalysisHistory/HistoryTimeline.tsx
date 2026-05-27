import React, { useState } from 'react';
import { Trash2, Loader2, ChevronDown } from 'lucide-react';
import type { AnalysisRecordSummary, AnalysisType } from '../../../shared/types';
import { useLanguage } from '../../hooks/useLanguage';

const TYPE_COLORS: Record<AnalysisType, string> = {
  ai: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  deep: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  quant: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  backtest: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  screener: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
};

const TYPE_LABEL_KEYS: Record<AnalysisType, 'type_ai' | 'type_deep' | 'type_quant' | 'type_backtest' | 'type_screener'> = {
  ai: 'type_ai',
  deep: 'type_deep',
  quant: 'type_quant',
  backtest: 'type_backtest',
  screener: 'type_screener',
};

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
  const { t, language } = useLanguage();

  function formatRelativeTime(ms: number): string {
    const diff = Date.now() - ms;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return t('just_now');
    if (minutes < 60) return t('minutes_ago', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('hours_ago', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('days_ago', { n: days });
    return new Date(ms).toLocaleDateString(language);
  }

  function extractSummary(record: AnalysisRecordSummary): string {
    try {
      const data = JSON.parse(record.resultJson);
      switch (record.type) {
        case 'ai':
          return `${data.sentiment ?? '—'} · ${t('history_rating')} ${data.rating ?? '—'}`;
        case 'deep':
          return `${data.synthesis?.signal ?? '—'} · ${t('history_consensus')} ${data.synthesis?.consensus ?? '—'}%`;
        case 'quant':
          return `${data.composite?.signal ?? '—'} · ${t('history_rating')} ${data.composite?.score ?? '—'}`;
        case 'backtest':
          return `${t('history_return')} ${((data.totalReturn ?? 0) * 100).toFixed(1)}% · ${t('history_win_rate')} ${((data.winRate ?? 0) * 100).toFixed(0)}%`;
        case 'screener':
          return `${Array.isArray(data) ? data.length : 0} ${t('history_stocks')}`;
        default:
          return '';
      }
    } catch {
      return '';
    }
  }

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
    return <p className="text-xs text-gray-500 text-center py-8">{t('no_history')}</p>;
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 mb-2 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          {t('delete_selected', { n: selected.size })}
        </button>
      )}

      {records.map(record => {
        const color = TYPE_COLORS[record.type];
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
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${color}`}>
                  {t(TYPE_LABEL_KEYS[record.type])}
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
          {t('load_more')}
        </button>
      )}
    </div>
  );
};

export default HistoryTimeline;
