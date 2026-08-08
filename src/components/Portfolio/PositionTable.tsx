import React from 'react';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { upColor, downColor } from '../../lib/market-hours';
import type { PositionValuation } from '../../../shared/types';

interface Props {
  valuations: PositionValuation[];
  onRemove: (id: number) => void;
  onSelect: (symbol: string) => void;
}

/** 缺值统一画 —，不要用 0 顶替：那会让"没数据"看起来像"不赚不赔" */
const DASH = '—';

const fmt = (n: number | undefined, digits = 2) =>
  n === undefined ? DASH : n.toLocaleString(undefined, { maximumFractionDigits: digits });

const signed = (n: number | undefined, digits = 2) =>
  n === undefined ? DASH : `${n >= 0 ? '+' : ''}${fmt(n, digits)}`;

const PositionTable: React.FC<Props> = ({ valuations, onRemove, onSelect }) => {
  const { t } = useLanguage();

  const th = 'px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap';
  const td = 'px-3 py-2 font-mono whitespace-nowrap';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b border-white/10">
          <tr>
            <th className={th}>{t('holdings_symbol')}</th>
            <th className={`${th} text-right`}>{t('holdings_shares')}</th>
            <th className={`${th} text-right`}>{t('holdings_cost_price')}</th>
            <th className={`${th} text-right`}>{t('holdings_price')}</th>
            <th className={`${th} text-right`}>{t('holdings_market_value')}</th>
            <th className={`${th} text-right`}>{t('holdings_pnl')}</th>
            <th className={`${th} text-right`}>{t('holdings_day_pnl')}</th>
            <th className={`${th} text-right`}>{t('holdings_weight')}</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {valuations.map((v) => {
            // 配色跟随该标的所在市场：A 股红涨、美股绿涨。取不到报价时不着色。
            const market = v.quote?.market ?? '美股';
            const pnlColor =
              v.pnl === undefined ? undefined : v.pnl >= 0 ? upColor(market) : downColor(market);
            const dayColor =
              v.dayPnl === undefined
                ? undefined
                : v.dayPnl >= 0
                  ? upColor(market)
                  : downColor(market);

            return (
              <tr key={v.position.id} className="border-b border-white/5 hover:bg-white/5 group">
                <td className={td}>
                  <button
                    onClick={() => onSelect(v.position.symbol)}
                    className="font-sans font-semibold text-gray-200 hover:text-emerald-400 transition-colors"
                    title={v.position.note}
                  >
                    {v.position.name ?? v.quote?.name ?? v.position.symbol}
                  </button>
                  <span className="ml-2 text-gray-600">{v.position.symbol}</span>
                </td>
                <td className={`${td} text-right text-gray-300`}>{fmt(v.position.shares, 4)}</td>
                <td className={`${td} text-right text-gray-300`}>{fmt(v.position.costPrice)}</td>
                <td className={`${td} text-right text-gray-300`}>{fmt(v.quote?.price)}</td>
                <td className={`${td} text-right text-gray-300`}>{fmt(v.marketValue, 0)}</td>
                <td className={`${td} text-right`} style={{ color: pnlColor }}>
                  {signed(v.pnl, 0)}
                  {v.pnlPercent !== undefined && (
                    <span className="ml-1 opacity-70">({signed(v.pnlPercent)}%)</span>
                  )}
                </td>
                <td className={`${td} text-right`} style={{ color: dayColor }}>
                  {signed(v.dayPnl, 0)}
                </td>
                <td className={`${td} text-right text-gray-400`}>
                  {v.weight === undefined ? DASH : `${fmt(v.weight, 1)}%`}
                </td>
                <td className={td}>
                  <button
                    onClick={() => onRemove(v.position.id)}
                    title={t('holdings_delete')}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-rose-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PositionTable;
