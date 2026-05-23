import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import type { QuantBundle, AnalystSignal } from '../../shared/types';

interface QuantScoreCardProps {
  quant: QuantBundle | null;
  loading: boolean;
  error: string | null;
}

const SIGNAL_STYLES = {
  bullish: { label: '看涨', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: TrendingUp },
  bearish: { label: '看跌', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', Icon: TrendingDown },
  neutral: { label: '中性', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', Icon: Minus },
} as const;

function getSignalStyle(signal: string) {
  return SIGNAL_STYLES[signal as keyof typeof SIGNAL_STYLES] ?? SIGNAL_STYLES.neutral;
}

function SignalCard({ title, signal, expanded, onToggle }: {
  title: string;
  signal: AnalystSignal;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = getSignalStyle(signal.signal);
  return (
    <button
      onClick={onToggle}
      className={`flex-1 p-3 rounded-xl border ${style.bg} text-left transition-all hover:brightness-110`}
    >
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{title}</div>
      <div className={`flex items-center gap-1.5 ${style.color} font-bold text-sm`}>
        <style.Icon className="w-4 h-4" />
        {style.label}
      </div>
      <div className="text-xs text-gray-500 mt-1">{signal.confidence}/100</div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
          {Object.entries(signal.details).map(([k, v]) => (
            <div key={k} className="text-[10px] text-gray-500 flex justify-between">
              <span>{k}</span>
              <span className="text-gray-300">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex justify-center">
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
      </div>
    </button>
  );
}

const QuantScoreCard: React.FC<QuantScoreCardProps> = ({ quant, loading, error }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3 text-gray-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin" />
        正在计算量化指标…
      </div>
    );
  }

  if (error || !quant) return null;

  const compositeStyle = getSignalStyle(quant.composite.signal);

  return (
    <div className="mb-6">
      <div className="flex gap-2 mb-3">
        <SignalCard
          title="技术面"
          signal={quant.technical}
          expanded={expanded === 'tech'}
          onToggle={() => setExpanded(expanded === 'tech' ? null : 'tech')}
        />
        <SignalCard
          title="基本面"
          signal={quant.fundamental}
          expanded={expanded === 'fund'}
          onToggle={() => setExpanded(expanded === 'fund' ? null : 'fund')}
        />
      </div>
      <div className={`p-2 rounded-lg text-center text-xs font-medium ${compositeStyle.bg} ${compositeStyle.color}`}>
        综合信号：{compositeStyle.label} {quant.composite.score}/100
      </div>
    </div>
  );
};

export default QuantScoreCard;
