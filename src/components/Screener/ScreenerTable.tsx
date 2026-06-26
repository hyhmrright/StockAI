import React from 'react';
import type { ScreenerResult } from '../../../shared/types';

const SIGNAL_BADGE: Record<string, string> = {
  bullish: 'bg-emerald-500/20 text-emerald-400',
  bearish: 'bg-rose-500/20 text-rose-400',
  neutral: 'bg-gray-500/20 text-gray-400',
  undervalued: 'bg-emerald-500/20 text-emerald-400',
  overvalued: 'bg-rose-500/20 text-rose-400',
  fair: 'bg-gray-500/20 text-gray-400',
  low: 'bg-emerald-500/20 text-emerald-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-rose-500/20 text-rose-400',
};

function Badge({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-gray-600">—</span>;
  const cls = SIGNAL_BADGE[value] ?? 'bg-gray-500/20 text-gray-400';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{value}</span>;
}

interface ScreenerTableProps {
  results: ScreenerResult[];
  onSelect: (symbol: string) => void;
}

const ScreenerTable: React.FC<ScreenerTableProps> = ({ results, onSelect }) => {
  if (results.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-6">暂无筛选结果</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-white/5">
            <th className="text-left py-2 px-2 font-medium">股票</th>
            <th className="text-right py-2 px-2 font-medium">评分</th>
            <th className="text-center py-2 px-2 font-medium">技术面</th>
            <th className="text-center py-2 px-2 font-medium">基本面</th>
            <th className="text-center py-2 px-2 font-medium">估值</th>
            <th className="text-center py-2 px-2 font-medium">风险</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr
              key={r.symbol}
              onClick={() => onSelect(r.symbol)}
              className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <td className="py-2.5 px-2">
                <div className="font-bold text-gray-200">{r.symbol}</div>
                <div className="text-[10px] text-gray-500 truncate max-w-[80px]">{r.name}</div>
              </td>
              <td className="text-right py-2.5 px-2">
                <span className="font-mono font-bold text-sm text-emerald-400">
                  {r.quant.composite.score?.toFixed(1) ?? '—'}
                </span>
              </td>
              <td className="text-center py-2.5 px-2">
                <Badge value={r.quant.technical.signal} />
              </td>
              <td className="text-center py-2.5 px-2">
                <Badge value={r.quant.fundamental.signal} />
              </td>
              <td className="text-center py-2.5 px-2">
                <Badge value={r.quant.valuation?.signal} />
              </td>
              <td className="text-center py-2.5 px-2">
                <Badge value={r.quant.risk?.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScreenerTable;
