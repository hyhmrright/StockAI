import React, { useEffect, useMemo, useState } from "react";
import ChartCanvas from "./ChartCanvas";
import QuoteHeader from "./QuoteHeader";
import Toolbar from "./Toolbar";
import CrosshairTooltip from "./CrosshairTooltip";
import { fetchKline, fetchRealtimeQuote } from "../../lib/ipc";
import { detectMarket } from "../../lib/market-hours";
import { sma } from "../../lib/indicators";
import { DEFAULT_CONFIG, rangeToPeriod, maPeriodsForMarket, type ChartConfig } from "./types";
import type { KlinePoint, RealtimeQuote } from "../../../shared/types";

interface Props {
  symbol: string;
}

const PriceChart: React.FC<Props> = ({ symbol }) => {
  const [config, setConfig] = useState<ChartConfig>(DEFAULT_CONFIG);
  const [data, setData] = useState<KlinePoint[]>([]);
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<KlinePoint | null>(null);

  const market = useMemo(() => detectMarket(symbol), [symbol]);

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
      .catch((e) => setError(e?.message || "K 线加载失败"));
  }, [symbol, config.range, config.adjust]);

  // 拉报价（symbol 变化时）
  useEffect(() => {
    fetchRealtimeQuote(symbol)
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [symbol]);

  // 十字光标对应的 MA 值（按当前 hover 的 K 线索引取出对应均线值）
  const crosshairMA = useMemo(() => {
    if (!crosshair || data.length === 0) return undefined;
    const idx = data.findIndex((p) => p.time === crosshair.time);
    if (idx < 0) return undefined;
    const closes = data.map((p) => p.close);
    const periods = maPeriodsForMarket(market);
    return {
      short: config.showMA.short ? sma(closes, periods.short)[idx] : null,
      mid:   config.showMA.mid   ? sma(closes, periods.mid)[idx]   : null,
      long:  config.showMA.long  ? sma(closes, periods.long)[idx]  : null,
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
          prevClose={quote?.prevClose}
          currentPrice={quote?.price}
          onCrosshair={setCrosshair}
        />
        <CrosshairTooltip
          point={crosshair}
          market={market}
          prevClose={quote?.prevClose}
          maValues={crosshairMA}
        />
      </div>
    </div>
  );
};

export default PriceChart;
