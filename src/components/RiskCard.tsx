import React from 'react';
import type { RiskSnapshot } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';

interface RiskCardProps {
  risk?: RiskSnapshot;
  loading?: boolean;
}

const RiskCard: React.FC<RiskCardProps> = ({ risk, loading }) => {
  const { t } = useLanguage();

  // 风险等级样式映射，放在组件内以便引用 t()
  function riskStyle(level: string): { label: string; className: string } {
    switch (level) {
      case 'low': return { label: t('low_risk'), className: 'text-emerald-400' };
      case 'high': return { label: t('high_risk'), className: 'text-rose-400' };
      default: return { label: t('medium_risk'), className: 'text-amber-400' };
    }
  }

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-20 mb-3" />
        <div className="h-3 bg-white/10 rounded w-full" />
      </div>
    );
  }
  if (!risk) return null;

  const { label, className } = riskStyle(risk.riskLevel);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">{t('risk_assessment')}</h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${className}`}>{label}</span>
          <span className="text-xs text-gray-500">{t('volatility_percentile')} {risk.volatilityPercentile}%</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-gray-500">{t('annualized_volatility')}</div>
            <div className="text-sm text-white">{(risk.annualizedVolatility * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('max_drawdown')}</div>
            <div className="text-sm text-rose-400">{(risk.maxDrawdown * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('sharpe_ratio')}</div>
            <div className="text-sm text-white">{Number.isFinite(risk.sharpeProxy) ? risk.sharpeProxy.toFixed(2) : 'N/A'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskCard;
