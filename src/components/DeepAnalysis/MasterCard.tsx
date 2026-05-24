import React from 'react';
import type { MasterSignal } from '../../../shared/types';
import { getMasterMeta } from './master-meta';

interface MasterCardProps {
  signal: MasterSignal;
}

function signalColor(signal: string): string {
  switch (signal) {
    case 'bullish': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'bearish': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    default: return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
}

function signalLabel(signal: string): string {
  switch (signal) {
    case 'bullish': return '看涨';
    case 'bearish': return '看跌';
    default: return '中性';
  }
}

const MasterCard: React.FC<MasterCardProps> = ({ signal }) => {
  const meta = getMasterMeta(signal.masterId);
  const name = meta?.nameZh ?? signal.masterId;
  const style = meta?.styleZh ?? '';

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{name}</span>
          {style && <span className="ml-2 text-[10px] text-gray-500">{style}</span>}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${signalColor(signal.signal)}`}>
          {signalLabel(signal.signal)} {signal.confidence}%
        </span>
      </div>
      <p className="text-xs text-gray-400 line-clamp-2">{signal.reasoning}</p>
    </div>
  );
};

export default MasterCard;
