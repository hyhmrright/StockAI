import React from 'react';
import { useLanguage } from '../hooks/useLanguage';
import type { StockInfo } from '../../shared/types';

/** 最新价 / 涨跌幅两张摘要卡（纯展示，从 Dashboard 抽出以收敛组件行数） */
const PriceSummaryCards: React.FC<{ stockInfo?: StockInfo }> = ({ stockInfo }) => {
  const { t } = useLanguage();
  const changePercent = stockInfo?.changePercent ?? 0;

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
        <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">
          {t('latest_price')}
        </div>
        <div className="text-2xl font-mono font-bold text-emerald-400">
          {stockInfo?.price?.toFixed(2) || t('no_data')}
          <span className="text-sm ml-2 text-gray-500">{stockInfo?.currency}</span>
        </div>
      </div>
      <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
        <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">
          {t('price_change')}
        </div>
        <div
          className={`text-2xl font-mono font-bold ${changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {changePercent >= 0 ? '+' : ''}
          {stockInfo?.changePercent?.toFixed(2) || '0.00'}%
        </div>
      </div>
    </div>
  );
};

export default PriceSummaryCards;
