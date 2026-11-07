import React, { useMemo, useState } from 'react';
import ChartCanvas from './ChartCanvas';
import SubChart from './SubChart';
import QuoteHeader from './QuoteHeader';
import Toolbar from './Toolbar';
import CrosshairTooltip from './CrosshairTooltip';
import { fetchKline } from '../../lib/ipc';
import { detectMarket } from '../../lib/market-hours';
import { sma } from '../../lib/indicators';
import { DEFAULT_CONFIG, rangeToPeriod, maPeriodsForMarket, type ChartConfig } from './types';
import { useRealtimeQuote } from '../../hooks/useRealtimeQuote';
import { useSymbolFetch } from '../../hooks/useSymbolFetch';
import type { KlinePoint, PriceLevel, TradeRecord } from '../../../shared/types';

interface Props {
  symbol: string;
  levels?: PriceLevel[]; // AI 关键价位线（来自 quant）
  backtestTrades?: TradeRecord[]; // 回测买卖点
  equityCurve?: { time: number; value: number }[]; // 回测净值曲线
}

const PriceChart: React.FC<Props> = ({ symbol, levels, backtestTrades, equityCurve }) => {
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG);
  const [crosshair, setCrosshair] = useState<KlinePoint | null>(null);

  const market = useMemo(() => detectMarket(symbol), [symbol]);
  const quote = useRealtimeQuote(symbol);

  const primary = useSymbolFetch<import('../../../shared/types').KlineSeries>(
    `${symbol}:${config.range}:${config.adjust}`,
    () =>
      fetchKline({
        symbol,
        period: rangeToPeriod(config.range),
        range: config.range,
        adjust: config.adjust,
      }),
    'kline_load_error',
  );
  const comparison = useSymbolFetch<import('../../../shared/types').KlineSeries>(
    config.compareSymbol ? `${config.compareSymbol}:${config.range}` : '',
    () =>
      fetchKline({
        symbol: config.compareSymbol ?? '',
        period: rangeToPeriod(config.range),
        range: config.range,
        adjust: 'qfq',
      }),
    'kline_load_error',
  );
  const error = primary.error;
  const compareData = comparison.data ?? [];
  // 行情更新只派生尾根，不修改原始历史或丢失来源元信息。
  const data = useMemo(() => {
    const original = primary.data ?? [];
    const last = original[original.length - 1];
    if (
      !quote ||
      !last ||
      new Date(last.time * 1000).toDateString() !== new Date(quote.timestamp * 1000).toDateString()
    )
      return original;
    const merged = [...original];
    merged[merged.length - 1] = {
      ...last,
      high: Math.max(last.high, quote.price),
      low: Math.min(last.low, quote.price),
      close: quote.price,
      volume: quote.volume || last.volume,
      amount: quote.amount || last.amount,
    };
    return Object.assign(merged, { metadata: primary.data?.metadata });
  }, [primary.data, quote]);

  // 十字光标对应的 MA 值（按当前 hover 的 K 线索引取出对应均线值）
  const crosshairMA = useMemo(() => {
    if (!crosshair || data.length === 0) return undefined;
    const idx = data.findIndex((p) => p.time === crosshair.time);
    if (idx < 0) return undefined;
    const closes = data.map((p) => p.close);
    const periods = maPeriodsForMarket(market);
    return {
      short: config.showMA.short ? sma(closes, periods.short)[idx] : null,
      mid: config.showMA.mid ? sma(closes, periods.mid)[idx] : null,
      long: config.showMA.long ? sma(closes, periods.long)[idx] : null,
    };
  }, [crosshair, data, market, config.showMA]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 overflow-hidden mb-8">
      <QuoteHeader quote={quote} fallbackSymbol={symbol} />
      <Toolbar config={config} onChange={setConfig} />
      <div className="relative">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm z-20 bg-black/50">
            {error}
          </div>
        )}
        <ChartCanvas
          data={data}
          market={market}
          logScale={config.logScale}
          showMA={config.showMA}
          showBoll={config.subIndicator === 'boll'}
          prevClose={quote?.prevClose}
          currentPrice={quote?.price}
          compareData={compareData}
          compareLabel={config.compareSymbol}
          onCrosshair={setCrosshair}
          levels={levels}
          backtestTrades={backtestTrades}
          equityCurve={equityCurve}
        />
        <CrosshairTooltip
          point={crosshair}
          market={market}
          prevClose={quote?.prevClose}
          maValues={crosshairMA}
        />
      </div>
      <SubChart data={data} indicator={config.subIndicator} market={market} />
      {data.metadata && (
        <p className="text-[10px] text-gray-500 mt-2">
          {data.metadata.source} · {new Date(data.metadata.fetchedAt).toLocaleString()} ·{' '}
          {data.metadata.actualAdjust}
          {data.metadata.degraded ? ' · ⚠' : ''}
        </p>
      )}
    </div>
  );
};

export default PriceChart;
