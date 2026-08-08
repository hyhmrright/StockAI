import React, { useEffect, useRef } from 'react';
import { type LineData, type UTCTimestamp, PriceScaleMode } from 'lightweight-charts';
import type { KlinePoint, PriceLevel, TradeRecord } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';
import { sma } from '../../lib/indicators';
import { maPeriodsForMarket, type Market } from './types';
import { useBollOverlay } from './useBollOverlay';
import { useChartOverlays } from './useChartOverlays';
import { useChartInstance } from './useChartInstance';
import { usePriceLines } from './usePriceLines';

interface Props {
  data: KlinePoint[];
  market: Market;
  logScale: boolean;
  height?: number;
  showMA: { short: boolean; mid: boolean; long: boolean };
  showBoll?: boolean;
  prevClose?: number; // 昨收水平线
  currentPrice?: number; // 当前价水平线
  compareData?: KlinePoint[];
  compareLabel?: string;
  onCrosshair?: (point: KlinePoint | null) => void;
  levels?: PriceLevel[]; // AI 关键价位线（quant 推导）
  backtestTrades?: TradeRecord[]; // 回测买卖点
  equityCurve?: { time: number; value: number }[]; // 回测净值曲线
}

/**
 * 主图画布：只负责「把数据喂进 series」。图表实例的创建/销毁在 useChartInstance，
 * 各叠加层（BOLL / 价位线 / 买卖点 / 净值 / 水平线）各自成 hook。
 */
const ChartCanvas: React.FC<Props> = ({
  data,
  market,
  logScale,
  height = 520,
  showMA,
  showBoll,
  prevClose,
  currentPrice,
  compareData,
  compareLabel,
  onCrosshair,
  levels,
  backtestTrades,
  equityCurve,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    chartRef,
    candleRef,
    volumeRef,
    maRef,
    bollRef,
    compareRef,
    equityRef,
    priceLinesRef,
    levelLinesRef,
  } = useChartInstance(containerRef, market, compareLabel, onCrosshair);

  // 喂入 K 线 / 成交量 / 均线
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return;

    const up = upColor(market),
      dn = downColor(market);
    candleRef.current.setData(
      data.map((p) => ({
        time: p.time as UTCTimestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    volumeRef.current.setData(
      data.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.volume,
        color: p.close >= p.open ? up + '80' : dn + '80',
      })),
    );

    // 根据 showMA 开关动态喂入 MA 数据
    if (maRef.current) {
      const { short: sp, mid: mp, long: lp } = maPeriodsForMarket(market);
      const closes = data.map((p) => p.close);
      const times = data.map((p) => p.time as UTCTimestamp);
      const toLine = (vals: (number | null)[]): LineData[] =>
        vals.flatMap((v, i) => (v == null ? [] : [{ time: times[i], value: v }]));
      maRef.current.short.setData(showMA.short ? toLine(sma(closes, sp)) : []);
      maRef.current.mid.setData(showMA.mid ? toLine(sma(closes, mp)) : []);
      maRef.current.long.setData(showMA.long ? toLine(sma(closes, lp)) : []);
    }

    // 「现」marker 与回测买卖点合并逻辑已抽至 useChartOverlays（setMarkers 单一入口）
    chartRef.current?.timeScale().fitContent();
  }, [data, market, showMA.short, showMA.mid, showMA.long]);

  // 对数坐标
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [logScale]);

  useBollOverlay(chartRef, bollRef, showBoll, data, market);

  useChartOverlays(candleRef, equityRef, levelLinesRef, {
    data,
    market,
    levels,
    backtestTrades,
    equityCurve,
  });

  usePriceLines(candleRef, priceLinesRef, { prevClose, currentPrice, market });

  // 比较基准数据：以起点为 100 归一化展示相对走势
  useEffect(() => {
    if (!compareRef.current) return;
    if (compareData && compareData.length > 0) {
      const base = compareData[0].close;
      compareRef.current.setData(
        compareData.map((p) => ({ time: p.time as UTCTimestamp, value: (p.close / base) * 100 })),
      );
    } else {
      compareRef.current.setData([]);
    }
  }, [compareData]);

  // 比较 series 的 title 在 chart 创建时只绑定一次，切换 compareSymbol 后需主动更新
  useEffect(() => {
    compareRef.current?.applyOptions({ title: compareLabel ?? 'Compare' });
  }, [compareLabel]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
};

export default ChartCanvas;
