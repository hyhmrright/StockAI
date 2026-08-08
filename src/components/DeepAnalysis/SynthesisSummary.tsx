import React from 'react';
import type { DeepAnalysisResult } from '../../../shared/types';
import { signalBadge } from '../../lib/signal-styles';
import { useLanguage } from '../../hooks/useLanguage';

interface SynthesisSummaryProps {
  synthesis: DeepAnalysisResult['synthesis'];
  totalMasters: number;
}

const SynthesisSummary: React.FC<SynthesisSummaryProps> = ({ synthesis, totalMasters }) => {
  const { t } = useLanguage();
  const badge = signalBadge(synthesis.signal, t);
  return (
    <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">{t('synthesis_title')}</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
          {badge.label} {synthesis.confidence}%
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>{t('synthesis_consensus', { n: synthesis.consensus })}</span>
        <span>{t('synthesis_participants', { n: totalMasters })}</span>
      </div>
      {synthesis.summary && (
        <p className="text-xs text-gray-300 leading-relaxed">{synthesis.summary}</p>
      )}
    </div>
  );
};

export default SynthesisSummary;
