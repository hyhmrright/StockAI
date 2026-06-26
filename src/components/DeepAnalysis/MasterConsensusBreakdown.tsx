import React from 'react';
import type { MasterSignal } from '../../../shared/types';
import { useLanguage } from '../../hooks/useLanguage';
import { computeMasterConsensus } from '../../lib/masterConsensus';

interface MasterConsensusBreakdownProps {
  signals: MasterSignal[];
}

/** 大师多空分布：三色占比条 + 计数，比单一「共识度」数字信息量更大 */
const MasterConsensusBreakdown: React.FC<MasterConsensusBreakdownProps> = ({ signals }) => {
  const { t } = useLanguage();
  const c = computeMasterConsensus(signals);
  if (c.total === 0) return null;

  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{t('master_consensus')}</span>
        <span>
          <span className="text-emerald-400">
            {t('bullish')} {c.bullish}
          </span>
          <span className="mx-1.5 text-gray-600">·</span>
          <span className="text-rose-400">
            {t('bearish')} {c.bearish}
          </span>
          <span className="mx-1.5 text-gray-600">·</span>
          <span className="text-amber-400">
            {t('neutral')} {c.neutral}
          </span>
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {c.bullish > 0 && <div className="bg-emerald-500" style={{ width: `${c.bullishPct}%` }} />}
        {c.neutral > 0 && <div className="bg-amber-500" style={{ width: `${c.neutralPct}%` }} />}
        {c.bearish > 0 && <div className="bg-rose-500" style={{ width: `${c.bearishPct}%` }} />}
      </div>
    </div>
  );
};

export default MasterConsensusBreakdown;
