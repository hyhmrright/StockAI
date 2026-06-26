import React from 'react';
import type { SentimentSignal } from '../../../shared/types';
import { useLanguage } from '../../hooks/useLanguage';

interface SentimentBreakdownProps {
  sentiment: SentimentSignal;
}

const SentimentBreakdown: React.FC<SentimentBreakdownProps> = ({ sentiment }) => {
  const { positive, negative, neutral, total } = sentiment.newsBreakdown;
  const { t } = useLanguage();
  if (total === 0) return null;

  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{t('news_sentiment')}</span>
        <span className="text-gray-500">{t('news_count', { n: total })}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {positive > 0 && <div className="bg-emerald-500" style={{ width: `${pPct}%` }} />}
        {neutral > 0 && (
          <div className="bg-gray-500" style={{ width: `${(neutral / total) * 100}%` }} />
        )}
        {negative > 0 && <div className="bg-rose-500" style={{ width: `${nPct}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span className="text-emerald-400">{t('sentiment_positive', { n: positive })}</span>
        <span>{t('sentiment_neutral_label', { n: neutral })}</span>
        <span className="text-rose-400">{t('sentiment_negative', { n: negative })}</span>
      </div>
    </div>
  );
};

export default SentimentBreakdown;
