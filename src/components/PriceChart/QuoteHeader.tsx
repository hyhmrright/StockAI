import React from 'react';
import type { RealtimeQuote } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';

interface Props {
  quote: RealtimeQuote | null;
  fallbackSymbol: string;
}

function formatNumber(n: number | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatBig(n: number | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + '万亿';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return n.toString();
}

const QuoteHeader: React.FC<Props> = ({ quote, fallbackSymbol }) => {
  if (!quote) {
    return (
      <div className="px-5 py-4 border-b border-white/5">
        <div className="font-bold text-lg">{fallbackSymbol}</div>
        <div className="text-xs text-gray-500 mt-1">行情加载中…</div>
      </div>
    );
  }

  const isUp = quote.change >= 0;
  const color = isUp ? upColor(quote.market) : downColor(quote.market);
  const sign = isUp ? '+' : '';
  const arrow = isUp ? '▲' : '▼';

  return (
    <div className="px-5 py-4 border-b border-white/5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <span className="text-lg font-bold">{quote.name}</span>
          <span className="text-xs text-gray-500 ml-2 font-mono">{quote.symbol}</span>
        </div>
        <div className="flex items-baseline gap-3 font-mono">
          <span className="text-2xl font-bold" style={{ color }}>
            {quote.currency === 'CNY' ? '¥' : '$'}
            {formatNumber(quote.price)}
          </span>
          <span className="text-base font-medium" style={{ color }}>
            {arrow} {sign}
            {formatNumber(quote.change)} ({sign}
            {formatNumber(quote.changePercent)}%)
          </span>
          {quote.preMarket && (
            <span className="text-xs text-gray-400">
              盘前 {formatNumber(quote.preMarket.price)} (
              {quote.preMarket.changePercent >= 0 ? '+' : ''}
              {formatNumber(quote.preMarket.changePercent)}%)
            </span>
          )}
          {quote.postMarket && (
            <span className="text-xs text-gray-400">
              盘后 {formatNumber(quote.postMarket.price)} (
              {quote.postMarket.changePercent >= 0 ? '+' : ''}
              {formatNumber(quote.postMarket.changePercent)}%)
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-1 text-xs text-gray-400 font-mono">
        <div>
          开 <span className="text-gray-200">{formatNumber(quote.open)}</span>
        </div>
        <div>
          高 <span className="text-gray-200">{formatNumber(quote.high)}</span>
        </div>
        <div>
          低 <span className="text-gray-200">{formatNumber(quote.low)}</span>
        </div>
        <div>
          昨收 <span className="text-gray-200">{formatNumber(quote.prevClose)}</span>
        </div>
        <div>
          量 <span className="text-gray-200">{formatBig(quote.volume)}</span>
        </div>
        <div>
          额 <span className="text-gray-200">{formatBig(quote.amount)}</span>
        </div>
        {quote.turnoverRate != null && (
          <div>
            换手 <span className="text-gray-200">{formatNumber(quote.turnoverRate)}%</span>
          </div>
        )}
        {quote.pe != null && (
          <div>
            PE <span className="text-gray-200">{formatNumber(quote.pe)}</span>
          </div>
        )}
        {quote.pb != null && (
          <div>
            PB <span className="text-gray-200">{formatNumber(quote.pb)}</span>
          </div>
        )}
        {quote.marketCap != null && (
          <div>
            市值 <span className="text-gray-200">{formatBig(quote.marketCap)}</span>
          </div>
        )}
        {quote.high52w != null && (
          <div>
            52周高 <span className="text-gray-200">{formatNumber(quote.high52w)}</span>
          </div>
        )}
        {quote.low52w != null && (
          <div>
            52周低 <span className="text-gray-200">{formatNumber(quote.low52w)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteHeader;
