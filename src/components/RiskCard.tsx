import React from 'react';
import type { RiskSnapshot } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';
import { computePositionGuidance, computeVolatilityRange } from '../lib/positionSizing';
import CardSkeleton from './CardSkeleton';

interface RiskCardProps {
  risk?: RiskSnapshot;
  loading?: boolean;
}

const RiskCard: React.FC<RiskCardProps> = ({ risk, loading }) => {
  const { t } = useLanguage();

  // 风险等级样式映射，放在组件内以便引用 t()
  function riskStyle(level: string): { label: string; className: string } {
    switch (level) {
      case 'low':
        return { label: t('low_risk'), className: 'text-emerald-400' };
      case 'high':
        return { label: t('high_risk'), className: 'text-rose-400' };
      default:
        return { label: t('medium_risk'), className: 'text-amber-400' };
    }
  }

  if (loading) {
    return <CardSkeleton titleWidth="w-20" />;
  }
  if (!risk) return null;

  const { label, className } = riskStyle(risk.riskLevel);
  // 由波动率派生建议仓位上限 + 半年波动区间（纯计算，缺数据时为 null 不渲染对应行）
  const guidance = computePositionGuidance(risk);
  const volRange = computeVolatilityRange(risk);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">
        {t('risk_assessment')}
      </h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${className}`}>{label}</span>
          <span className="text-xs text-gray-500">
            {t('volatility_percentile')} {risk.volatilityPercentile}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-gray-500">{t('annualized_volatility')}</div>
            <div className="text-sm text-white">
              {(risk.annualizedVolatility * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('max_drawdown')}</div>
            <div className="text-sm text-rose-400">{(risk.maxDrawdown * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('sharpe_ratio')}</div>
            <div className="text-sm text-white">
              {Number.isFinite(risk.sharpeProxy) ? risk.sharpeProxy.toFixed(2) : 'N/A'}
            </div>
          </div>
        </div>
        {guidance && (
          <div className="pt-2 mt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('suggested_position_cap')}</span>
              <span className="text-sm font-bold text-sky-400">{guidance.maxPositionPct}%</span>
            </div>
            <p className="text-[10px] leading-tight text-gray-600 mt-1">
              {t('position_cap_basis')}
            </p>
          </div>
        )}
        {volRange && (
          <div className="pt-2 mt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('volatility_range_label')}</span>
              <span className="text-xs">
                <span className="text-rose-400">{volRange.downside}%</span>
                <span className="mx-1 text-gray-600">~</span>
                <span className="text-emerald-400">+{volRange.upside}%</span>
              </span>
            </div>
            <p className="text-[10px] leading-tight text-gray-600 mt-1">
              {t('volatility_range_disclaimer')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskCard;
