import React from 'react';
import type { FundFlowData } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';

interface FundFlowCardProps {
  fundFlow?: FundFlowData;
}

/** 个股资金流向卡（A 股专属）：主力净流入 + 超大/大/中/小单分解，对标同花顺/东财资金流门面 */
const FundFlowCard: React.FC<FundFlowCardProps> = ({ fundFlow }) => {
  const { t } = useLanguage();
  if (!fundFlow) return null;

  // 单位元 → 亿元，2 位小数；正流入绿、流出红
  const yi = (v: number) => (v / 1e8).toFixed(2);
  const color = (v: number) =>
    v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-gray-400';
  const sign = (v: number) => (v > 0 ? '+' : '');

  const orders = [
    { label: t('super_large_order'), value: fundFlow.superLargeNet },
    { label: t('large_order'), value: fundFlow.largeNet },
    { label: t('medium_order'), value: fundFlow.mediumNet },
    { label: t('small_order'), value: fundFlow.smallNet },
  ];

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">
        {t('fund_flow')}
      </h2>
      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">{t('main_net_inflow')}</span>
          <span className={`text-sm font-bold ${color(fundFlow.mainNet)}`}>
            {sign(fundFlow.mainNet)}
            {yi(fundFlow.mainNet)} {t('unit_yi')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {orders.map((o) => (
            <div key={o.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{o.label}</span>
              <span className={color(o.value)}>
                {sign(o.value)}
                {yi(o.value)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1">
          {fundFlow.date} · {t('fund_flow_note')}
        </p>
      </div>
    </div>
  );
};

export default FundFlowCard;
