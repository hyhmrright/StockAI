import React from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import SentimentBar from './SentimentBar';
import StockInfoCard from './StockInfoCard';
import { FullAnalysisResponse } from '../../shared/types';

interface AnalysisPanelProps {
  result: FullAnalysisResponse | null;
}

/** 根据情绪类型返回对应的 Tailwind 背景色 class（完整类名，避免 Tailwind purge 问题） */
function sentimentBgClass(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500';
    case 'bearish': return 'bg-rose-500';
    case 'neutral': return 'bg-amber-500';
  }
}

/** 根据情绪类型返回徽章样式 class */
function sentimentBadgeClass(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500/20 text-emerald-500';
    case 'bearish': return 'bg-rose-500/20 text-rose-500';
    case 'neutral': return 'bg-amber-500/20 text-amber-500';
  }
}

/**
 * 右侧分析面板 — 舆情概览 + AI 洞察
 */
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result }) => {
  const bgClass = sentimentBgClass(result?.analysis.sentiment ?? 'bullish');
  const badgeClass = result ? sentimentBadgeClass(result.analysis.sentiment) : '';

  return (
    <aside className="w-1/4 border-l border-white/10 bg-panel p-6 overflow-y-auto hidden lg:block">
      {/* 股票信息卡片 */}
      {result?.stockInfo && <StockInfoCard info={result.stockInfo} />}

      {/* 舆情概览区 */}
      <div className="mb-10">
        <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">舆情概览 (Sentiment)</h2>
        <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
          <SentimentBar bullish={result ? result.analysis.rating : 65} />

          <div className="mt-6 flex gap-3">
            <div className={`w-1.5 h-auto rounded-full shrink-0 ${bgClass}`} />
            <p className="text-sm text-gray-300 leading-relaxed italic font-light">
              "{result ? result.analysis.summary : "正在通过 AI 分析市场情绪。请稍候..."}"
            </p>
          </div>
        </div>
      </div>

      {/* AI 洞察区 */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
          {result && (
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeClass}`}>
              {result.analysis.sentiment}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {result ? (
            <>
              {result.analysis.pros.map((pro, i) => (
                <div key={`pro-${i}`} className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                  <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />
                    利多因素
                  </div>
                  <div className="text-sm leading-snug">{pro}</div>
                </div>
              ))}
              {result.analysis.cons.map((con, i) => (
                <div key={`con-${i}`} className="p-5 border-l-4 border-rose-500 bg-rose-500/5 rounded-r-xl">
                  <div className="text-xs text-rose-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3" />
                    风险提示
                  </div>
                  <div className="text-sm leading-snug">{con}</div>
                </div>
              ))}
            </>
          ) : (
            <div className="text-center py-10 opacity-50 space-y-4">
              <div className="flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500/30" />
              </div>
              <div className="text-xs">等待分析数据...</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AnalysisPanel;
