import React from 'react';
import type { ScreenMatch } from '../../../shared/types';
import { useLanguage } from '../../hooks/useLanguage';

interface NlScreenerTableProps {
  matches: ScreenMatch[];
  onSelect: (symbol: string) => void;
}

/** 数值展示：缺值统一显示 em dash，避免把 undefined 当 0 误导 */
function num(v: number | undefined, digits = 2): string {
  return v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);
}

/**
 * #14 NL 选股结果表：代码/名/价/PE/PB/市值/综合分。
 * 与 watchlist 的 ScreenerTable 分开（数据源为 ScreenMatch 而非 ScreenerResult）。
 */
const NlScreenerTable: React.FC<NlScreenerTableProps> = ({ matches, onSelect }) => {
  const { t } = useLanguage();

  // 市值（元）→ 亿，整数展示；缺值 em dash
  const mktCap = (cap: number | undefined): string =>
    cap === undefined || Number.isNaN(cap) ? '—' : `${Math.round(cap / 1e8)}${t('yi_unit')}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-white/5">
            <th className="text-left py-2 px-2 font-medium">{t('screener_col_stock')}</th>
            <th className="text-right py-2 px-2 font-medium">{t('screener_col_price')}</th>
            <th className="text-right py-2 px-2 font-medium">{t('screener_col_pe')}</th>
            <th className="text-right py-2 px-2 font-medium">{t('screener_col_pb')}</th>
            <th className="text-right py-2 px-2 font-medium">{t('screener_col_mktcap')}</th>
            <th className="text-right py-2 px-2 font-medium">{t('screener_col_score')}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr
              key={m.symbol}
              onClick={() => onSelect(m.symbol)}
              className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td className="py-2.5 px-2">
                <div className="font-bold text-gray-200 font-mono">{m.symbol}</div>
                <div className="text-[10px] text-gray-500 truncate max-w-[96px]">{m.name}</div>
              </td>
              <td className="text-right py-2.5 px-2 font-mono text-gray-200">
                {num(m.snapshot.price)}
              </td>
              <td className="text-right py-2.5 px-2 font-mono text-gray-300">
                {num(m.snapshot.pe)}
              </td>
              <td className="text-right py-2.5 px-2 font-mono text-gray-300">
                {num(m.snapshot.pb)}
              </td>
              <td className="text-right py-2.5 px-2 font-mono text-gray-300">
                {mktCap(m.snapshot.marketCap)}
              </td>
              <td className="text-right py-2.5 px-2">
                <span className="font-mono font-bold text-sm text-emerald-400">
                  {m.quant ? num(m.quant.composite.score, 0) : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default NlScreenerTable;
