import React from 'react';
import { X, Briefcase, Loader2, Info } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { usePortfolio } from '../../hooks/usePortfolio';
import { upColor, downColor } from '../../lib/market-hours';
import PositionForm from './PositionForm';
import PositionTable from './PositionTable';
import type { PortfolioSummary } from '../../../shared/types';

interface Props {
  onClose: () => void;
  /** 点持仓行里的标的名 → 切到该股并关闭本弹窗 */
  onSelect: (symbol: string) => void;
}

const SYMBOL: Record<PortfolioSummary['currency'], string> = { CNY: '¥', USD: '$' };

const money = (n: number, currency: PortfolioSummary['currency']) =>
  `${SYMBOL[currency]}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** 一个币种的汇总卡。跨币种不合并——没有汇率源，加总只是编数字。 */
const SummaryCard: React.FC<{ s: PortfolioSummary }> = ({ s }) => {
  const { t } = useLanguage();
  // A 股红涨美股绿涨：CNY 汇总按 A 股习惯着色，USD 按美股
  const market = s.currency === 'CNY' ? 'A股' : '美股';
  const color = s.totalPnl >= 0 ? upColor(market) : downColor(market);
  const dayColor = s.dayPnl >= 0 ? upColor(market) : downColor(market);
  const sign = (n: number) => (n >= 0 ? '+' : '');

  return (
    <div className="flex-1 min-w-[240px] bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-bold tracking-widest text-gray-500">{s.currency}</span>
        <span className="text-[10px] text-gray-600">
          {t('holdings_position_count', { count: s.positionCount })}
        </span>
      </div>
      <div className="mt-2 font-mono text-2xl font-bold" style={{ color }}>
        {sign(s.totalPnl)}
        {money(s.totalPnl, s.currency)}
        <span className="ml-2 text-base">
          ({sign(s.totalPnlPercent)}
          {s.totalPnlPercent.toFixed(2)}%)
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-mono text-gray-400">
        <div>
          <div className="text-gray-600">{t('holdings_total_value')}</div>
          {money(s.totalValue, s.currency)}
        </div>
        <div>
          <div className="text-gray-600">{t('holdings_total_cost')}</div>
          {money(s.totalCost, s.currency)}
        </div>
        <div>
          <div className="text-gray-600">{t('holdings_day_pnl')}</div>
          <span style={{ color: dayColor }}>
            {sign(s.dayPnl)}
            {money(s.dayPnl, s.currency)}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * 持仓弹窗：汇总卡（按币种）+ 建仓表单 + 逐笔明细。
 *
 * 与 MasterPortfolioPanel（虚拟大师组合）是两回事：那边跟踪的是 AI 的判断准不准，
 * 这边是用户自己的钱。
 */
const PortfolioModal: React.FC<Props> = ({ onClose, onSelect }) => {
  const { t } = useLanguage();
  const { overview, loading, error, add, remove } = usePortfolio();
  const { summaries, valuations, unpriced } = overview;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="w-full max-w-5xl bg-panel border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-100">
            <Briefcase className="w-4 h-4 text-emerald-400" />
            {t('holdings_title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {error !== null && <p className="text-sm text-rose-400">{t('holdings_load_error')}</p>}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            </div>
          ) : (
            <>
              {summaries.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-3">
                    {summaries.map((s) => (
                      <SummaryCard key={s.currency} s={s} />
                    ))}
                  </div>
                  {summaries.length > 1 && (
                    <p className="flex items-start gap-1.5 text-[11px] text-gray-600">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      {t('holdings_currency_note')}
                    </p>
                  )}
                </>
              )}

              {unpriced.length > 0 && (
                <p className="text-[11px] text-amber-500/80">
                  {t('holdings_unpriced', { symbols: unpriced.join(', ') })}
                </p>
              )}

              <PositionForm onSubmit={add} />

              {valuations.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-8">{t('holdings_empty')}</p>
              ) : (
                <PositionTable
                  valuations={valuations}
                  onRemove={remove}
                  onSelect={(symbol) => {
                    onSelect(symbol);
                    onClose();
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioModal;
