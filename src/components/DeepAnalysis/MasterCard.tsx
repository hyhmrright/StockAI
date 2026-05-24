import React from 'react';
import type { MasterSignal } from '../../../shared/types';
import { getMasterMeta } from './master-meta';
import { signalColor, signalLabel } from '../../lib/signal-styles';

interface MasterCardProps {
  signal: MasterSignal;
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
