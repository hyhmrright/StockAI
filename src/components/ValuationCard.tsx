import React from 'react';
import type { ValuationSnapshot } from '../../shared/types';

interface ValuationCardProps {
  valuation?: ValuationSnapshot;
  loading?: boolean;
}

function signalStyle(signal: string): { label: string; className: string } {
  switch (signal) {
    case 'undervalued': return { label: '低估', className: 'text-emerald-400' };
    case 'overvalued':  return { label: '高估', className: 'text-rose-400' };
    default:            return { label: '合理', className: 'text-amber-400' };
  }
}

function formatYi(n: number): string {
  if (!Number.isFinite(n)) return 'N/A';
  return `${(n / 1e8).toFixed(0)}亿`;
}

const ValuationCard: React.FC<ValuationCardProps> = ({ valuation, loading }) => {
  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-24 mb-3" />
        <div className="h-3 bg-white/10 rounded w-full" />
      </div>
    );
  }
  if (!valuation) return null;

  const { label, className } = signalStyle(valuation.signal);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">估值分析</h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${className}`}>{label}</span>
          {valuation.marginOfSafety != null && (
            <span className="text-xs text-gray-400">
              安全边际 {valuation.marginOfSafety > 0 ? '+' : ''}{(valuation.marginOfSafety * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {valuation.intrinsicValue != null && valuation.marketCap != null && (
          <div className="flex justify-between text-xs text-gray-400">
            <span>内在价值 ~{formatYi(valuation.intrinsicValue)}</span>
            <span>市值 {formatYi(valuation.marketCap)}</span>
          </div>
        )}

        {valuation.models.dcf && valuation.models.dcf.wacc > 0 && (
          <div className="text-[10px] text-gray-500">
            DCF: {formatYi(valuation.models.dcf.bear)} ~ {formatYi(valuation.models.dcf.bull)} (WACC {(valuation.models.dcf.wacc * 100).toFixed(1)}%)
          </div>
        )}

        {valuation.models.relative && (
          <div className="text-[10px] text-gray-500">{valuation.models.relative.details}</div>
        )}
      </div>
    </div>
  );
};

export default ValuationCard;
