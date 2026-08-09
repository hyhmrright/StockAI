import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useAsyncOnce } from '../../hooks/useAsyncOnce';
import { fetchSectorBoards } from '../../lib/ipc';
import { formatServiceError } from '../../lib/service-errors';
import { upColor, downColor } from '../../lib/market-hours';
import { formatAmount } from './format';
import type { SectorRank } from '../../../shared/types';

// 板块榜只有 A 股，固定按 A 股习惯着色（红涨绿跌）
const tone = (v: number) => (v >= 0 ? upColor('A股') : downColor('A股'));

const SectorList: React.FC<{
  title: string;
  items: SectorRank[];
  onSelect: (s: string) => void;
}> = ({ title, items, onSelect }) => {
  const { t } = useLanguage();

  return (
    <div className="flex-1 min-w-[280px]">
      <h3 className="text-xs font-bold tracking-widest text-gray-500 mb-2">{title}</h3>
      <div className="flex flex-col gap-1">
        {items.map((s) => (
          <div
            key={s.code}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-sm text-gray-200 truncate">{s.name}</div>
              {/* 备源（新浪）没有这两项，缺失时显示「—」而不是 0——0 会被读成"没有资金进出" */}
              <div className="text-[10px] text-gray-600 font-mono">
                {t('sectors_breadth')}{' '}
                {s.advancers == null || s.decliners == null ? '—' : `${s.advancers}/${s.decliners}`}{' '}
                · {t('sectors_main_inflow')}{' '}
                {s.mainNetInflow == null ? (
                  '—'
                ) : (
                  <span style={{ color: tone(s.mainNetInflow) }}>
                    {formatAmount(s.mainNetInflow)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {s.leader && (
                <button
                  onClick={() => onSelect(s.leader!.symbol)}
                  className="text-[10px] text-gray-500 hover:text-emerald-400 transition-colors text-right"
                  title={t('sectors_leader')}
                >
                  <div className="truncate max-w-[72px]">{s.leader.name}</div>
                  <div className="font-mono" style={{ color: upColor('A股') }}>
                    +{s.leader.changePercent.toFixed(2)}%
                  </div>
                </button>
              )}
              <span
                className="text-sm font-mono font-semibold w-16 text-right"
                style={{ color: tone(s.changePercent) }}
              >
                {s.changePercent >= 0 ? '+' : ''}
                {s.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** 板块涨幅榜：行业与概念两栏。打开才拉、只拉一次。 */
const SectorPanel: React.FC<{ onSelect: (symbol: string) => void }> = ({ onSelect }) => {
  const { t } = useLanguage();
  const { data: boards, error } = useAsyncOnce(fetchSectorBoards);

  if (error !== null) {
    return <p className="text-sm text-rose-400">{formatServiceError(error, t, 'sectors_error')}</p>;
  }
  if (!boards) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-6">
      <SectorList title={t('sectors_industry')} items={boards.industry} onSelect={onSelect} />
      <SectorList title={t('sectors_concept')} items={boards.concept} onSelect={onSelect} />
    </div>
  );
};

export default SectorPanel;
