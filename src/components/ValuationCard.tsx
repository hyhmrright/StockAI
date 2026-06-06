import React from 'react';
import type { ValuationSnapshot } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';
import CardSkeleton from './CardSkeleton';

interface ValuationCardProps {
  valuation?: ValuationSnapshot;
  loading?: boolean;
}

function formatYi(n: number, unit: string): string {
  if (!Number.isFinite(n)) return 'N/A';
  return `${(n / 1e8).toFixed(0)}${unit}`;
}

const ValuationCard: React.FC<ValuationCardProps> = ({ valuation, loading }) => {
  const { t } = useLanguage();

  // 估值信号样式映射，放在组件内以便引用 t()
  function signalStyle(signal: string): { label: string; className: string } {
    switch (signal) {
      case 'undervalued': return { label: t('undervalued'), className: 'text-emerald-400' };
      case 'overvalued':  return { label: t('overvalued'), className: 'text-rose-400' };
      default:            return { label: t('fairly_valued'), className: 'text-amber-400' };
    }
  }

  if (loading) {
    return <CardSkeleton />;
  }
  if (!valuation) return null;

  const { label, className } = signalStyle(valuation.signal);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">{t('valuation_analysis')}</h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${className}`}>{label}</span>
          {valuation.marginOfSafety != null && (
            <span className="text-xs text-gray-400">
              {t('margin_of_safety')} {valuation.marginOfSafety > 0 ? '+' : ''}{(valuation.marginOfSafety * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {valuation.intrinsicValue != null && valuation.marketCap != null && (
          <div className="flex justify-between text-xs text-gray-400">
            <span>{t('intrinsic_value')} ~{formatYi(valuation.intrinsicValue, t('yi_unit'))}</span>
            <span>{t('market_cap')} {formatYi(valuation.marketCap, t('yi_unit'))}</span>
          </div>
        )}

        {valuation.models.dcf && valuation.models.dcf.wacc > 0 && (
          <div className="text-[10px] text-gray-500">
            DCF: {formatYi(valuation.models.dcf.bear, t('yi_unit'))} ~ {formatYi(valuation.models.dcf.bull, t('yi_unit'))} (WACC {(valuation.models.dcf.wacc * 100).toFixed(1)}%)
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
