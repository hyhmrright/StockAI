import React from 'react';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import type { AIAnalysisRecord } from '../hooks/useAIAnalysis';

/** 把"分析时间"渲染为"x 分钟前 / x 小时前"等友好提示 */
export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.floor(hr / 24)} 天前`;
}

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
  const buttonLabel = record ? '重新 AI 分析' : '开始 AI 分析';

  return (
    <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-4">
      <button
        type="button"
        onClick={onAnalyze}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all
          ${
            disabled
              ? 'bg-white/5 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:scale-[1.02] active:scale-[0.98]'
          }`}
      >
        <Sparkles className="w-4 h-4" />
        {buttonLabel}
      </button>
      <div className="text-[11px] text-gray-500 leading-relaxed">
        {disabled ? (
          '正在等待新闻数据，分析按钮在数据就绪后可用。'
        ) : (
          <>
            点击后调用 LLM <span className="text-amber-400/90">（消耗 tokens）</span>。当前：
            {providerLabel} · {modelLabel}
          </>
        )}
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

export default AnalysisTriggerCard;
