import React, { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
} from "lightweight-charts";
import type { KlinePoint } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";

interface Props {
  data: KlinePoint[];
  market: "A股" | "美股";
  logScale: boolean;
  height?: number;
  onCrosshair?: (point: KlinePoint | null) => void;
}

const ChartCanvas: React.FC<Props> = ({ data, market, logScale, height = 520, onCrosshair }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const crosshairCbRef = useRef(onCrosshair);

  // 让 ref 始终持有最新的 onCrosshair，避免被 effect 闭包"锁定"
  useEffect(() => { crosshairCbRef.current = onCrosshair; }, [onCrosshair]);

  // 创建图表 — 仅在首次挂载时执行
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "rgba(255,255,255,0.55)" },
      grid:   { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    const candle = chart.addCandlestickSeries({
      upColor: upColor(market),
      downColor: downColor(market),
      borderUpColor: upColor(market),
      borderDownColor: downColor(market),
      wickUpColor: upColor(market),
      wickDownColor: downColor(market),
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    // 十字光标订阅 — 通过 ref 间接调用，避免 onCrosshair 引用变化触发图表重建
    chart.subscribeCrosshairMove((param) => {
      const cb = crosshairCbRef.current;
      if (!cb) return;
      if (!param.time || !param.seriesData.get(candle)) {
        cb(null);
        return;
      }
      const cd = param.seriesData.get(candle) as CandlestickData;
      const vd = param.seriesData.get(volume) as HistogramData | undefined;
      cb({
        time: cd.time as number,
        open: cd.open,
        high: cd.high,
        low: cd.low,
        close: cd.close,
        volume: vd?.value ?? 0,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [market]);

  // 喂入数据
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;

    const candleData: CandlestickData[] = data.map((p) => ({
      time: p.time as UTCTimestamp,
      open: p.open, high: p.high, low: p.low, close: p.close,
    }));

    const volData: HistogramData[] = data.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.volume,
      color: p.close >= p.open ? upColor(market) + "80" : downColor(market) + "80",
    }));

    candleRef.current.setData(candleData);
    volumeRef.current.setData(volData);
    chartRef.current?.timeScale().fitContent();
  }, [data, market]);

  // 对数坐标
  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
};

export default ChartCanvas;
