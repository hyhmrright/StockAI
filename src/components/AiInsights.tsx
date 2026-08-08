import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import SentimentBar from './SentimentBar';
import { sentimentBgClass, sentimentBadgeClass } from '../lib/signal-styles';
import { useLanguage } from '../hooks/useLanguage';
import type { AIAnalysisResult } from '../../shared/types';

/**
 * AI 分析结论展示区：舆情概览 + 利多/利空洞察 + 技术面/基本面解读。
 * 纯展示，从 AnalysisPanel 抽出以收敛组件行数。
 */
const AiInsights: React.FC<{ result: AIAnalysisResult }> = ({ result }) => {
  const { t } = useLanguage();

  return (
    <>
      <div className="mb-10">
        <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">
          {t('sentiment_overview')}
        </h2>
        <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
          <SentimentBar bullish={result.rating} />
          <div className="mt-6 flex gap-3">
            <div
              className={`w-1.5 h-auto rounded-full shrink-0 ${sentimentBgClass(result.sentiment)}`}
            />
            <p className="text-sm text-gray-300 leading-relaxed italic font-light">
              "{result.summary}"
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">
            {t('ai_insights')}
          </h2>
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${sentimentBadgeClass(result.sentiment)}`}
          >
            {result.sentiment}
          </div>
        </div>
        <div className="space-y-4">
          {result.pros.map((pro, i) => (
            <div
              key={`pro-${i}`}
              className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl"
            >
              <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" />
                {t('pros')}
              </div>
              <div className="text-sm leading-snug">{pro}</div>
            </div>
          ))}
          {result.cons.map((con, i) => (
            <div
              key={`con-${i}`}
              className="p-5 border-l-4 border-rose-500 bg-rose-500/5 rounded-r-xl"
            >
              <div className="text-xs text-rose-500 mb-2 font-bold flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3" />
                {t('cons')}
              </div>
              <div className="text-sm leading-snug">{con}</div>
            </div>
          ))}
        </div>

        {(result.technicalView || result.fundamentalView) && (
          <div className="mt-6 space-y-3">
            {result.technicalView && (
              <div className="p-4 bg-sky-500/5 border-l-4 border-sky-500 rounded-r-xl">
                <div className="text-xs text-sky-400 mb-1 font-bold">{t('technical_view')}</div>
                <div className="text-sm leading-snug">{result.technicalView}</div>
              </div>
            )}
            {result.fundamentalView && (
              <div className="p-4 bg-violet-500/5 border-l-4 border-violet-500 rounded-r-xl">
                <div className="text-xs text-violet-400 mb-1 font-bold">
                  {t('fundamental_view')}
                </div>
                <div className="text-sm leading-snug">{result.fundamentalView}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default AiInsights;
