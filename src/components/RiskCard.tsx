import React from 'react';

interface RiskData {
  annualizedVolatility: number;
  volatilityPercentile: number;
  maxDrawdown: number;
  sharpeProxy: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface RiskCardProps {
  risk?: RiskData;
  loading?: boolean;
}

function riskStyle(level: string): { label: string; className: string } {
  switch (level) {
    case 'low': return { label: '低风险', className: 'text-emerald-400' };
    case 'high': return { label: '高风险', className: 'text-rose-400' };
    default: return { label: '中风险', className: 'text-amber-400' };
  }
}

const RiskCard: React.FC<RiskCardProps> = ({ risk, loading }) => {
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
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">风险评估</h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${className}`}>{label}</span>
          <span className="text-xs text-gray-500">波动率百分位 {risk.volatilityPercentile}%</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-gray-500">年化波动率</div>
            <div className="text-sm text-white">{(risk.annualizedVolatility * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">最大回撤</div>
            <div className="text-sm text-rose-400">{(risk.maxDrawdown * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">夏普比率</div>
            <div className="text-sm text-white">{risk.sharpeProxy}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskCard;
