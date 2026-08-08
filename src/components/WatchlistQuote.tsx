import React from 'react';
import { upColor, downColor } from '../lib/market-hours';
import type { RealtimeQuote } from '../../shared/types';

interface Props {
  quote?: RealtimeQuote;
  /** 该标的在最近一次取价中失败 */
  failed: boolean;
}

/**
 * 关注列表行右侧的现价 + 涨跌幅。
 *
 * 「取价失败」与「还没取到」用不同的占位符：前者是 —，后者留白。
 * 都画成留白的话，一个持续失败的数据源看起来只是"加载有点慢"，用户会一直等。
 *
 * 涨跌配色走 upColor/downColor 而非固定绿涨红跌——A 股与美股的习惯正好相反。
 */
const WatchlistQuote: React.FC<Props> = ({ quote, failed }) => {
  if (!quote) {
    return <span className="text-xs font-mono text-gray-600">{failed ? '—' : ''}</span>;
  }

  const isUp = quote.change >= 0;
  const color = isUp ? upColor(quote.market) : downColor(quote.market);

  return (
    <div className="flex flex-col items-end leading-tight font-mono">
      <span className="text-xs font-semibold" style={{ color }}>
        {quote.price.toFixed(2)}
      </span>
      <span className="text-[10px]" style={{ color }}>
        {isUp ? '+' : ''}
        {quote.changePercent.toFixed(2)}%
      </span>
    </div>
  );
};

export default WatchlistQuote;
