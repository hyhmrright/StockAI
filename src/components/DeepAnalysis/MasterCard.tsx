import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  // 默认收起为 2 行，点击展开查看完整理由
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded(prev => !prev)}
      className="w-full text-left p-4 bg-white/5 rounded-xl border border-white/5 space-y-2 hover:bg-white/[0.07] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{name}</span>
          {style && <span className="ml-2 text-[10px] text-gray-500">{style}</span>}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${signalColor(signal.signal)}`}>
          {signalLabel(signal.signal)} {signal.confidence}%
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <p className={`flex-1 text-xs text-gray-400 ${expanded ? '' : 'line-clamp-2'}`}>{signal.reasoning}</p>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-gray-600 shrink-0 mt-0.5" />
          : <ChevronDown className="w-3 h-3 text-gray-600 shrink-0 mt-0.5" />}
      </div>
    </button>
  );
};

export default MasterCard;
