import React from 'react';
import type { SentimentSignal } from '../../../shared/types';

interface SentimentBreakdownProps {
  sentiment: SentimentSignal;
}

const SentimentBreakdown: React.FC<SentimentBreakdownProps> = ({ sentiment }) => {
  const { positive, negative, neutral, total } = sentiment.newsBreakdown;
  if (total === 0) return null;

  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">新闻情绪</span>
        <span className="text-gray-500">{total} 条新闻</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {positive > 0 && <div className="bg-emerald-500" style={{ width: `${pPct}%` }} />}
        {neutral > 0 && <div className="bg-gray-500" style={{ width: `${100 - pPct - nPct}%` }} />}
        {negative > 0 && <div className="bg-rose-500" style={{ width: `${nPct}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span className="text-emerald-400">正面 {positive}</span>
        <span>中性 {neutral}</span>
        <span className="text-rose-400">负面 {negative}</span>
      </div>
    </div>
  );
};

export default SentimentBreakdown;
