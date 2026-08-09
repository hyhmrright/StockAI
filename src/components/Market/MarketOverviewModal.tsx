import React, { useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import SectorPanel from './SectorPanel';
import BillboardPanel from './BillboardPanel';

interface Props {
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

type Tab = 'sectors' | 'billboard';

/**
 * 市场概览：板块涨幅榜 + 龙虎榜。
 *
 * 两块都不轮询——它们是「今天什么在动」的横截面，为它们再挂定时器不值得
 * （指数条已经在刷了）。分页签而非并排，是因为龙虎榜要打三次请求，
 * 只看板块的用户不该为它付代价：面板按页签挂载，切到才拉。
 */
const MarketOverviewModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('sectors');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sectors', label: t('market_overview') },
    { key: 'billboard', label: t('billboard') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-panel border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-sm font-bold transition-colors ${
                  tab === key ? 'text-gray-100' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {tab === 'sectors' ? (
            <SectorPanel onSelect={onSelect} />
          ) : (
            <BillboardPanel onSelect={onSelect} />
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketOverviewModal;
