import React from 'react';
import { Loader2, TrendingUp, TrendingDown, Sparkles, AlertCircle } from 'lucide-react';
import SentimentBar from './SentimentBar';
import StockInfoCard from './StockInfoCard';
import type { AIAnalysisRecord } from '../hooks/useAIAnalysis';
import type { StockInfo } from '../../shared/types';

interface AnalysisPanelProps {
  stockInfo?: StockInfo;
  record: AIAnalysisRecord | null;
  analyzing: boolean;
  error: string | null;
  /** 当前是否已有新闻可分析（来自 useStockData） */
  hasNews: boolean;
  /** 当前生效的 Provider / 模型，用于在按钮下方提示 */
  providerLabel: string;
  modelLabel: string;
  onAnalyze: () => void;
}

function sentimentBgClass(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500';
    case 'bearish': return 'bg-rose-500';
    case 'neutral': return 'bg-amber-500';
  }
}

function sentimentBadgeClass(sentiment: 'bullish' | 'bearish' | 'neutral'): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500/20 text-emerald-500';
    case 'bearish': return 'bg-rose-500/20 text-rose-500';
    case 'neutral': return 'bg-amber-500/20 text-amber-500';
  }
}

/** 把"分析时间"渲染为"x 分钟前 / x 小时前"等友好提示 */
function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

/**
 * 右侧分析面板 — 三态：
 *  1. 未分析：醒目大按钮触发 LLM（默认状态）
 *  2. 分析中：spinner + 模型名
 *  3. 已完成：评分 / sentiment / 利好 / 利空（原 UI）
 */
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  stockInfo, record, analyzing, error, hasNews, providerLabel, modelLabel, onAnalyze,
}) => {
  const result = record?.result;
  const bgClass = sentimentBgClass(result?.sentiment ?? 'bullish');
  const badgeClass = result ? sentimentBadgeClass(result.sentiment) : '';

  return (
    <aside className="w-1/4 border-l border-white/10 bg-panel p-6 overflow-y-auto hidden lg:block">
      {stockInfo && <StockInfoCard info={stockInfo} />}

      {/* AI 触发卡片 — 永远显示，状态决定形态 */}
      <div className="mb-10">
        <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">AI 智能分析</h2>
        <AnalysisTriggerCard
          analyzing={analyzing}
          hasNews={hasNews}
          record={record}
          error={error}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onAnalyze={onAnalyze}
        />
      </div>

      {/* 公司概况区 (AI 提取) */}
      {result?.sector && (
        <div className="mb-10">
          <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">公司概况 (Profile)</h2>
          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-4">
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                {result.sector}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                {result.industry}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{result.description}</p>
          </div>
        </div>
      )}

      {/* 已分析才显示舆情和洞察 */}
      {result && (
        <>
          <div className="mb-10">
            <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">舆情概览 (Sentiment)</h2>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
              <SentimentBar bullish={result.rating} />
              <div className="mt-6 flex gap-3">
                <div className={`w-1.5 h-auto rounded-full shrink-0 ${bgClass}`} />
                <p className="text-sm text-gray-300 leading-relaxed italic font-light">"{result.summary}"</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeClass}`}>
                {result.sentiment}
              </div>
            </div>
            <div className="space-y-4">
              {result.pros.map((pro, i) => (
                <div key={`pro-${i}`} className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                  <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />利多因素
                  </div>
                  <div className="text-sm leading-snug">{pro}</div>
                </div>
              ))}
              {result.cons.map((con, i) => (
                <div key={`con-${i}`} className="p-5 border-l-4 border-rose-500 bg-rose-500/5 rounded-r-xl">
                  <div className="text-xs text-rose-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3" />风险提示
                  </div>
                  <div className="text-sm leading-snug">{con}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};

/** 触发卡片：根据 analyzing / record / error / hasNews 决定形态 */
const AnalysisTriggerCard: React.FC<{
  analyzing: boolean;
  hasNews: boolean;
  record: AIAnalysisRecord | null;
  error: string | null;
  providerLabel: string;
  modelLabel: string;
  onAnalyze: () => void;
}> = ({ analyzing, hasNews, record, error, providerLabel, modelLabel, onAnalyze }) => {
  if (analyzing) {
    return (
      <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
        <div className="text-sm font-medium text-emerald-400">{modelLabel} 正在分析…</div>
        <div className="text-[11px] text-gray-500">{providerLabel}</div>
      </div>
    );
  }

  const disabled = !hasNews;
  const buttonLabel = record ? "重新 AI 分析" : "开始 AI 分析";

  return (
    <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-4">
      <button
        type="button"
        onClick={onAnalyze}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
          ${disabled
            ? "bg-white/5 text-gray-500 cursor-not-allowed"
            : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:scale-[1.02] active:scale-[0.98]"
          }`}
      >
        <Sparkles className="w-4 h-4" />
        {buttonLabel}
      </button>
      <div className="text-[11px] text-gray-500 leading-relaxed">
        {disabled
          ? "正在等待新闻数据，分析按钮在数据就绪后可用。"
          : <>点击后调用 LLM <span className="text-amber-400/90">（消耗 tokens）</span>。当前：{providerLabel} · {modelLabel}</>
        }
      </div>
      {record && !analyzing && (
        <div className="text-[11px] text-gray-400 border-t border-white/5 pt-3">
          上次分析：{formatRelative(record.analyzedAt)}（{record.newsSnapshotLength} 条新闻）
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-[11px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
