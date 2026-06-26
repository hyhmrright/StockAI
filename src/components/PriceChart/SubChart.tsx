import React, { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type UTCTimestamp,
  type LineData,
  type HistogramData,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import type { KlinePoint } from '../../../shared/types';
import type { SubChartIndicator } from './types';
import { CHART_THEME } from './chart-theme';
import { macd, rsi, kdj, obv, vwap } from '../../lib/indicators';
import { upColor, downColor } from '../../lib/market-hours';

interface Props {
  data: KlinePoint[];
  indicator: SubChartIndicator;
  market: 'A股' | '美股';
  height?: number;
}

const SubChart: React.FC<Props> = ({ data, indicator, market, height = 140 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // BOLL 不在副图绘制（由主图叠加上下轨），直接返回 null
  if (indicator === 'boll') return null;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.background },
        textColor: CHART_THEME.textMuted,
      },
      grid: {
        vertLines: { color: CHART_THEME.gridSubtle },
        horzLines: { color: CHART_THEME.gridSubtle },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false, visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    chartRef.current = chart;

    if (data.length === 0) {
      return () => {
        chart.remove();
        chartRef.current = null;
      };
    }

    const times = data.map((p) => p.time as UTCTimestamp);
    const closes = data.map((p) => p.close);
    const highs = data.map((p) => p.high);
    const lows = data.map((p) => p.low);
    const vols = data.map((p) => p.volume);

    const toLine = (vals: (number | null)[]): LineData<UTCTimestamp>[] =>
      vals
        .map((v, i) => (v == null ? null : { time: times[i], value: v }))
        .filter((x): x is LineData<UTCTimestamp> => x !== null);

    const palette = CHART_THEME.series;
    const lineOpts = {
      lineWidth: 1 as const,
      priceLineVisible: false as const,
      lastValueVisible: false as const,
    };

    if (indicator === 'macd') {
      const { dif, dea, hist } = macd(closes);
      const sDif = chart.addLineSeries({ color: palette.yellow, ...lineOpts });
      sDif.setData(toLine(dif));
      const sDea = chart.addLineSeries({ color: palette.purple, ...lineOpts });
      sDea.setData(toLine(dea));
      const sHist = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      const histData: HistogramData<UTCTimestamp>[] = [];
      hist.forEach((v, i) => {
        if (v == null) return;
        histData.push({
          time: times[i],
          value: v,
          color: v >= 0 ? upColor(market) + 'B0' : downColor(market) + 'B0',
        });
      });
      sHist.setData(histData);
    } else if (indicator === 'rsi') {
      const series = chart.addLineSeries({ color: palette.cyan, ...lineOpts });
      series.setData(toLine(rsi(closes)));
    } else if (indicator === 'kdj') {
      const { k, d, j } = kdj(highs, lows, closes);
      const sK = chart.addLineSeries({ color: palette.yellow, ...lineOpts });
      sK.setData(toLine(k));
      const sD = chart.addLineSeries({ color: palette.purple, ...lineOpts });
      sD.setData(toLine(d));
      const sJ = chart.addLineSeries({ color: palette.pink, ...lineOpts });
      sJ.setData(toLine(j));
    } else if (indicator === 'obv') {
      const series = chart.addLineSeries({ color: palette.cyan, ...lineOpts });
      series.setData(obv(closes, vols).map((v, i) => ({ time: times[i], value: v })));
    } else if (indicator === 'vwap') {
      const series = chart.addLineSeries({ color: palette.yellow, ...lineOpts });
      series.setData(vwap(highs, lows, closes, vols).map((v, i) => ({ time: times[i], value: v })));
    }

    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, indicator, market]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
};

export default SubChart;
