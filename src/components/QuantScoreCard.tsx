import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import type { QuantBundle, AnalystSignal } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';

interface QuantScoreCardProps {
  quant: QuantBundle | null;
  loading: boolean;
  error: string | null;
}

const SIGNAL_STYLES_BASE = {
  bullish: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: TrendingUp },
  bearish: { color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', Icon: TrendingDown },
  neutral: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', Icon: Minus },
} as const;

function SignalCard({ title, signal, expanded, onToggle, label, color, bg, Icon }: {
  title: string;
  signal: AnalystSignal;
  expanded: boolean;
  onToggle: () => void;
  label: string;
  color: string;
  bg: string;
  Icon: React.ElementType;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex-1 p-3 rounded-xl border ${bg} text-left transition-all hover:brightness-110`}
    >
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{title}</div>
      <div className={`flex items-center gap-1.5 ${color} font-bold text-sm`}>
        <Icon className="w-4 h-4" />
        {label}
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
  const { t } = useLanguage();

  // 信号标签映射，放在组件内以便引用 t()
  const SIGNAL_LABELS: Record<string, string> = {
    bullish: t('bullish'),
    bearish: t('bearish'),
    neutral: t('neutral'),
  };

  function getSignalStyle(signal: string) {
    const key = signal as keyof typeof SIGNAL_STYLES_BASE;
    const base = SIGNAL_STYLES_BASE[key] ?? SIGNAL_STYLES_BASE.neutral;
    const label = SIGNAL_LABELS[signal] ?? SIGNAL_LABELS.neutral;
    return { ...base, label };
  }

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3 text-gray-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('quant_calculating')}
      </div>
    );
  }

  if (error || !quant) return null;

  const compositeStyle = getSignalStyle(quant.composite.signal);

  return (
    <div className="mb-6">
      <div className="flex gap-2 mb-3">
        <SignalCard
          title={t('technical')}
          signal={quant.technical}
          expanded={expanded === 'tech'}
          onToggle={() => setExpanded(expanded === 'tech' ? null : 'tech')}
          label={getSignalStyle(quant.technical.signal).label}
          color={getSignalStyle(quant.technical.signal).color}
          bg={getSignalStyle(quant.technical.signal).bg}
          Icon={getSignalStyle(quant.technical.signal).Icon}
        />
        <SignalCard
          title={t('fundamental')}
          signal={quant.fundamental}
          expanded={expanded === 'fund'}
          onToggle={() => setExpanded(expanded === 'fund' ? null : 'fund')}
          label={getSignalStyle(quant.fundamental.signal).label}
          color={getSignalStyle(quant.fundamental.signal).color}
          bg={getSignalStyle(quant.fundamental.signal).bg}
          Icon={getSignalStyle(quant.fundamental.signal).Icon}
        />
      </div>
      <div className={`p-2 rounded-lg text-center text-xs font-medium ${compositeStyle.bg} ${compositeStyle.color}`}>
        {t('composite_signal')}：{compositeStyle.label} {quant.composite.score}/100
      </div>
    </div>
  );
};

export default QuantScoreCard;
