import React from 'react';
import type { RealtimeQuote } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';
import { useLanguage } from '../../hooks/useLanguage';
import { formatBig as fmtBig, formatNumber as fmtNumber } from '../../lib/locale';

interface Props {
  quote: RealtimeQuote | null;
  fallbackSymbol: string;
}

const QuoteHeader: React.FC<Props> = ({ quote, fallbackSymbol }) => {
  const { language, t } = useLanguage();
  const formatNumber = (n: number | undefined, digits = 2) => fmtNumber(n, language, digits);
  const formatBig = (n: number | undefined) => fmtBig(n, language);

  if (!quote) {
    return (
      <div className="px-5 py-4 border-b border-white/5">
        <div className="font-bold text-lg">{fallbackSymbol}</div>
        <div className="text-xs text-gray-500 mt-1">{t('quote_loading')}</div>
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
              {t('quote_premarket')} {formatNumber(quote.preMarket.price)} (
              {quote.preMarket.changePercent >= 0 ? '+' : ''}
              {formatNumber(quote.preMarket.changePercent)}%)
            </span>
          )}
          {quote.postMarket && (
            <span className="text-xs text-gray-400">
              {t('quote_postmarket')} {formatNumber(quote.postMarket.price)} (
              {quote.postMarket.changePercent >= 0 ? '+' : ''}
              {formatNumber(quote.postMarket.changePercent)}%)
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-1 text-xs text-gray-400 font-mono">
        <div>
          {t('ohlc_open')} <span className="text-gray-200">{formatNumber(quote.open)}</span>
        </div>
        <div>
          {t('ohlc_high')} <span className="text-gray-200">{formatNumber(quote.high)}</span>
        </div>
        <div>
          {t('ohlc_low')} <span className="text-gray-200">{formatNumber(quote.low)}</span>
        </div>
        <div>
          {t('quote_prev_close')}{' '}
          <span className="text-gray-200">{formatNumber(quote.prevClose)}</span>
        </div>
        <div>
          {t('ohlc_volume')} <span className="text-gray-200">{formatBig(quote.volume)}</span>
        </div>
        <div>
          {t('quote_amount')} <span className="text-gray-200">{formatBig(quote.amount)}</span>
        </div>
        {quote.turnoverRate != null && (
          <div>
            {t('quote_turnover_rate')}{' '}
            <span className="text-gray-200">{formatNumber(quote.turnoverRate)}%</span>
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
            {t('market_cap')} <span className="text-gray-200">{formatBig(quote.marketCap)}</span>
          </div>
        )}
        {quote.high52w != null && (
          <div>
            {t('quote_52w_high')}{' '}
            <span className="text-gray-200">{formatNumber(quote.high52w)}</span>
          </div>
        )}
        {quote.low52w != null && (
          <div>
            {t('quote_52w_low')} <span className="text-gray-200">{formatNumber(quote.low52w)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteHeader;
