import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { StockInfo } from '../lib/api-types';

interface StockInfoCardProps {
  info: StockInfo;
}

type Trend = 'up' | 'down' | 'flat';

const TREND_STYLES = {
  up:   { priceColor: 'text-emerald-400', badgeBg: 'bg-emerald-500/15 text-emerald-400', icon: TrendingUp,   sign: '+' },
  down: { priceColor: 'text-rose-400',    badgeBg: 'bg-rose-500/15 text-rose-400',       icon: TrendingDown, sign: '' },
  flat: { priceColor: 'text-gray-400',    badgeBg: 'bg-gray-500/15 text-gray-400',        icon: Minus,        sign: '' },
} as const;

/**
 * 股票基本信息卡片
 * 显示交易所标签、名称、代码、最新价和涨跌幅
 */
const StockInfoCard: React.FC<StockInfoCardProps> = ({ info }) => {
  const pct = info.changePercent ?? 0;
  const trend: Trend = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const { priceColor, badgeBg, icon: ChangeIcon, sign } = TREND_STYLES[trend];
  const currencySymbol = info.currency === 'CNY' ? '¥' : '$';

  return (
    <div className="mb-4 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 shrink-0">
              {info.exchange}
            </span>
            <span className="text-sm font-semibold text-white truncate">{info.name}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">{info.code} · {info.market}</div>
        </div>

        {info.price !== undefined && (
          <div className="text-right shrink-0">
            <div className={`text-base font-bold tabular-nums ${priceColor}`}>
              {currencySymbol}{info.price.toFixed(2)}
            </div>
            {info.changePercent !== undefined && (
              <div className={`flex items-center justify-end gap-0.5 text-[11px] tabular-nums ${badgeBg} px-1.5 py-0.5 rounded mt-0.5`}>
                <ChangeIcon className="w-3 h-3" />
                <span>{sign}{info.changePercent.toFixed(2)}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockInfoCard;
