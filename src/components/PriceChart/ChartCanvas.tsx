import React, { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type IPriceLine,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  LineStyle,
} from "lightweight-charts";
import type { KlinePoint } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";
import { sma, boll } from "../../lib/indicators";
import { maPeriodsForMarket, MA_COLORS } from "./types";

interface Props {
  data: KlinePoint[];
  market: "A股" | "美股";
  logScale: boolean;
  height?: number;
  showMA: { short: boolean; mid: boolean; long: boolean };
  showBoll?: boolean;
  prevClose?: number;     // 昨收水平线
  currentPrice?: number;  // 当前价水平线
  compareData?: KlinePoint[];
  compareLabel?: string;
  onCrosshair?: (point: KlinePoint | null) => void;
}

const ChartCanvas: React.FC<Props> = ({
  data, market, logScale, height = 520,
  showMA, showBoll, prevClose, currentPrice, compareData, compareLabel, onCrosshair,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const crosshairCbRef = useRef(onCrosshair);
  const maRef = useRef<{ short: ISeriesApi<"Line">; mid: ISeriesApi<"Line">; long: ISeriesApi<"Line"> } | null>(null);
  const bollRef = useRef<{ upper: ISeriesApi<"Line">; mid: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> } | null>(null);
  const priceLinesRef = useRef<{ prev?: IPriceLine; current?: IPriceLine }>({});
  const compareRef = useRef<ISeriesApi<"Line"> | null>(null);

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

    const up = upColor(market), dn = downColor(market);
    const candle = chart.addCandlestickSeries({
      upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn,
    });

    const volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    // 三条均线 — 颜色由 types.ts 中 MA_COLORS 集中管理
    const maOpts = { lineWidth: 1 as const, priceLineVisible: false as const, lastValueVisible: false as const };
    maRef.current = {
      short: chart.addLineSeries({ color: MA_COLORS.short, ...maOpts }),
      mid:   chart.addLineSeries({ color: MA_COLORS.mid,   ...maOpts }),
      long:  chart.addLineSeries({ color: MA_COLORS.long,  ...maOpts }),
    };

    // 比较基准 series — 独立坐标轴避免干扰主图刻度
    compareRef.current = chart.addLineSeries({ color: "#FF6B9D", lineWidth: 1, priceScaleId: "compare", lastValueVisible: true, priceLineVisible: false, title: compareLabel ?? "Compare" });
    chart.priceScale("compare").applyOptions({ visible: false, scaleMargins: { top: 0.05, bottom: 0.3 } }); // 隐藏第二轴刻度

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    // 十字光标订阅 — 通过 ref 间接调用，避免 onCrosshair 引用变化触发图表重建
    chart.subscribeCrosshairMove((param) => {
      const cb = crosshairCbRef.current;
      if (!cb) return;
      if (!param.time || !param.seriesData.get(candle)) { cb(null); return; }
      const cd = param.seriesData.get(candle) as CandlestickData;
      const vd = param.seriesData.get(volume) as HistogramData | undefined;
      cb({ time: cd.time as number, open: cd.open, high: cd.high, low: cd.low, close: cd.close, volume: vd?.value ?? 0 });
    });

    return () => {
      chart.remove();
      maRef.current = bollRef.current = compareRef.current = chartRef.current = candleRef.current = volumeRef.current = null;
      priceLinesRef.current = {};  // 清除指向旧 chart 的 IPriceLine handle
    };
  }, [market]);

  // 喂入数据
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;

    const up = upColor(market), dn = downColor(market);
    candleRef.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close })));
    volumeRef.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.volume, color: p.close >= p.open ? up + "80" : dn + "80" })));

    // 根据 showMA 开关动态喂入 MA 数据
    if (maRef.current) {
      const { short: sp, mid: mp, long: lp } = maPeriodsForMarket(market);
      const closes = data.map((p) => p.close);
      const times  = data.map((p) => p.time as UTCTimestamp);
      const toLine = (vals: (number | null)[]): LineData[] =>
        vals.flatMap((v, i) => (v == null ? [] : [{ time: times[i], value: v }]));
      maRef.current.short.setData(showMA.short ? toLine(sma(closes, sp)) : []);
      maRef.current.mid.setData(  showMA.mid   ? toLine(sma(closes, mp)) : []);
      maRef.current.long.setData( showMA.long  ? toLine(sma(closes, lp)) : []);
    }

    chartRef.current?.timeScale().fitContent();
  }, [data, market, showMA.short, showMA.mid, showMA.long]);

  // 对数坐标
  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale]);

  // BOLL 上下轨叠加（主图）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const bandOpts = { priceLineVisible: false as const, lastValueVisible: false as const };
    if (showBoll && !bollRef.current) {
      bollRef.current = {
        upper: chart.addLineSeries({ color: "rgba(255,255,255,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed, ...bandOpts }),
        mid:   chart.addLineSeries({ color: "rgba(255,255,255,0.6)", lineWidth: 1, ...bandOpts }),
        lower: chart.addLineSeries({ color: "rgba(255,255,255,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed, ...bandOpts }),
      };
    } else if (!showBoll && bollRef.current) {
      const b = bollRef.current;
      chart.removeSeries(b.upper); chart.removeSeries(b.mid); chart.removeSeries(b.lower);
      bollRef.current = null;
    }
    if (showBoll && bollRef.current && data.length > 0) {
      const { upper, mid, lower } = boll(data.map((p) => p.close));
      const times = data.map((p) => p.time as UTCTimestamp);
      const toLine = (vs: (number | null)[]): LineData<UTCTimestamp>[] =>
        vs.map((v, i) => (v == null ? null : { time: times[i], value: v })).filter((x): x is LineData<UTCTimestamp> => x !== null);
      bollRef.current.upper.setData(toLine(upper));
      bollRef.current.mid.setData(toLine(mid));
      bollRef.current.lower.setData(toLine(lower));
    }
  }, [showBoll, data]);

  // 比较基准数据：以起点为 100 归一化展示相对走势
  useEffect(() => {
    if (!compareRef.current) return;
    if (compareData && compareData.length > 0) {
      const base = compareData[0].close;
      compareRef.current.setData(compareData.map((p) => ({ time: p.time as UTCTimestamp, value: (p.close / base) * 100 })));
    } else {
      compareRef.current.setData([]);
    }
  }, [compareData]);

  // 关键水平线：昨收虚线 + 当前价实线（标签实时跟随）
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;

    // 移除旧线，防止重复叠加
    const pl = priceLinesRef.current;
    if (pl.prev)    { candle.removePriceLine(pl.prev);    pl.prev    = undefined; }
    if (pl.current) { candle.removePriceLine(pl.current); pl.current = undefined; }

    if (prevClose != null)
      pl.prev = candle.createPriceLine({ price: prevClose, color: "rgba(255,255,255,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed,  axisLabelVisible: true, title: "昨收" });
    if (currentPrice != null) {
      const color = (prevClose == null || currentPrice >= prevClose) ? upColor(market) : downColor(market);
      pl.current = candle.createPriceLine({ price: currentPrice, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "现价" });
    }
  }, [prevClose, currentPrice, market]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
};

export default ChartCanvas;
