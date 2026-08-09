import React from 'react';
import { Loader2, Info } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useAsyncOnce } from '../../hooks/useAsyncOnce';
import { fetchBillboard } from '../../lib/ipc';
import { formatServiceError } from '../../lib/service-errors';
import { upColor, downColor } from '../../lib/market-hours';
import { formatAmount } from './format';
import type { BillboardEntry } from '../../../shared/types';

// 龙虎榜只有 A 股，固定按 A 股习惯着色（红涨绿跌）
const tone = (v: number) => (v >= 0 ? upColor('A股') : downColor('A股'));

const BillboardList: React.FC<{
  title: string;
  items: BillboardEntry[];
  onSelect: (s: string) => void;
}> = ({ title, items, onSelect }) => {
  const { t } = useLanguage();

  return (
    <div className="flex-1 min-w-[300px]">
      <h3 className="text-xs font-bold tracking-widest text-gray-500 mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600 px-3 py-2">{t('billboard_empty')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((e) => (
            // 同股同日可上多个榜，代码本身不唯一——键里必须带上榜原因
            <button
              key={`${e.symbol}-${e.reason}`}
              onClick={() => onSelect(e.symbol)}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
            >
              <div className="min-w-0">
                <div className="text-sm text-gray-200 truncate">
                  {e.name}
                  <span className="ml-1.5 text-[10px] text-gray-600 font-mono">{e.symbol}</span>
                </div>
                <div className="text-[10px] text-gray-600 truncate" title={e.reason}>
                  {e.reason}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className="text-sm font-mono font-semibold"
                  style={{ color: tone(e.netAmount) }}
                >
                  {e.netAmount >= 0 ? '+' : '−'}
                  {formatAmount(Math.abs(e.netAmount))}
                </div>
                <div className="text-[10px] font-mono" style={{ color: tone(e.changePercent) }}>
                  {e.changePercent >= 0 ? '+' : ''}
                  {e.changePercent.toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** 龙虎榜：最新交易日的净买入 / 净卖出两榜。打开才拉、只拉一次。 */
const BillboardPanel: React.FC<{ onSelect: (symbol: string) => void }> = ({ onSelect }) => {
  const { t } = useLanguage();
  const { data, error } = useAsyncOnce(fetchBillboard);

  if (error !== null) {
    return (
      <p className="text-sm text-rose-400">{formatServiceError(error, t, 'billboard_error')}</p>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 榜单归属交易日必须显式标出：盘中看到的永远是上一个交易日的榜 */}
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="font-mono">
          {t('billboard_trade_date')} {data.tradeDate}
        </span>
        <span className="flex items-center gap-1 text-gray-600">
          <Info className="w-3 h-3 shrink-0" />
          {t('billboard_multi_listing')}
        </span>
      </div>

      <div className="flex flex-wrap gap-6">
        <BillboardList title={t('billboard_top_buy')} items={data.topBuy} onSelect={onSelect} />
        <BillboardList title={t('billboard_top_sell')} items={data.topSell} onSelect={onSelect} />
      </div>
    </div>
  );
};

export default BillboardPanel;
