import React, { useEffect, useState } from 'react';
import { X, Loader2, TrendingUp } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { fetchSectorBoards } from '../lib/ipc';
import { formatServiceError } from '../lib/service-errors';
import { upColor, downColor } from '../lib/market-hours';
import type { SectorBoards, SectorRank } from '../../shared/types';

interface Props {
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

/** 主力净流入按亿/万元收敛——原始单位是元，直接显示是一串十位数字 */
function formatInflow(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(0)} 万`;
  return String(Math.round(v));
}

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
        {items.map((s) => {
          // 板块榜只有 A 股，固定按 A 股习惯着色（红涨绿跌）
          const color = s.changePercent >= 0 ? upColor('A股') : downColor('A股');
          return (
            <div
              key={s.code}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm text-gray-200 truncate">{s.name}</div>
                <div className="text-[10px] text-gray-600 font-mono">
                  {t('sectors_breadth')} {s.advancers}/{s.decliners} · {t('sectors_main_inflow')}{' '}
                  <span style={{ color: s.mainNetInflow >= 0 ? upColor('A股') : downColor('A股') }}>
                    {formatInflow(s.mainNetInflow)}
                  </span>
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
                <span className="text-sm font-mono font-semibold w-16 text-right" style={{ color }}>
                  {s.changePercent >= 0 ? '+' : ''}
                  {s.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 市场概览：行业与概念两张板块涨幅榜。
 *
 * 只在打开时拉一次，不轮询——板块榜是"今天什么在涨"的横截面，
 * 为它再挂一个定时器不值得（指数条已经在刷了）。
 */
const MarketOverviewModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const { t } = useLanguage();
  const [boards, setBoards] = useState<SectorBoards | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSectorBoards()
      .then((b) => !cancelled && setBoards(b))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-panel border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-100">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            {t('market_overview')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {error !== null ? (
            <p className="text-sm text-rose-400">{formatServiceError(error, t, 'sectors_error')}</p>
          ) : !boards ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-6">
              <SectorList
                title={t('sectors_industry')}
                items={boards.industry}
                onSelect={(s) => {
                  onSelect(s);
                  onClose();
                }}
              />
              <SectorList
                title={t('sectors_concept')}
                items={boards.concept}
                onSelect={(s) => {
                  onSelect(s);
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketOverviewModal;
