import React, { useEffect, useMemo, useState } from 'react';
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
import type { KlinePoint } from '../../../shared/types';

interface Props {
  symbol: string;
}

const PriceChart: React.FC<Props> = ({ symbol }) => {
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG);
  const [data, setData] = useState<KlinePoint[]>([]);
  const [compareData, setCompareData] = useState<KlinePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<KlinePoint | null>(null);

  const market = useMemo(() => detectMarket(symbol), [symbol]);
  const quote = useRealtimeQuote(symbol);

  // 拉 K 线（symbol / range / adjust 任一变化都重拉）
  useEffect(() => {
    setError(null);
    fetchKline({
      symbol,
      period: rangeToPeriod(config.range),
      range: config.range,
      adjust: config.adjust,
    })
      .then(setData)
      .catch((e) => setError(e?.message || 'K 线加载失败'));
  }, [symbol, config.range, config.adjust]);

  // 拉取比较基准的 K 线（symbol/range 变化时同步重拉）
  useEffect(() => {
    if (!config.compareSymbol) {
      setCompareData([]);
      return;
    }
    fetchKline({
      symbol: config.compareSymbol,
      period: rangeToPeriod(config.range),
      range: config.range,
      adjust: 'qfq',
    })
      .then(setCompareData)
      .catch(() => setCompareData([]));
  }, [config.compareSymbol, config.range]);

  // 用实时报价 update 最后一根 K 线（同一交易日时合并）
  useEffect(() => {
    if (!quote || data.length === 0) return;
    const last = data[data.length - 1];
    const lastDate = new Date(last.time * 1000).toDateString();
    const quoteDate = new Date(quote.timestamp * 1000).toDateString();
    if (lastDate !== quoteDate) return;
    setData((prev) => {
      const merged = [...prev];
      const i = merged.length - 1;
      merged[i] = {
        time: merged[i].time,
        open: merged[i].open,
        high: Math.max(merged[i].high, quote.price),
        low: Math.min(merged[i].low, quote.price),
        close: quote.price,
        volume: quote.volume || merged[i].volume,
        amount: quote.amount || merged[i].amount,
      };
      return merged;
    });
  }, [quote]);

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
        />
        <CrosshairTooltip
          point={crosshair}
          market={market}
          prevClose={quote?.prevClose}
          maValues={crosshairMA}
        />
      </div>
      <SubChart data={data} indicator={config.subIndicator} market={market} />
    </div>
  );
};

export default PriceChart;
