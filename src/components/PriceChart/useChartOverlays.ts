import { useEffect, type MutableRefObject } from 'react';
import {
  type ISeriesApi,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
  LineStyle,
} from 'lightweight-charts';
import type { KlinePoint, PriceLevel, TradeRecord } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';
import { CHART_THEME } from './chart-theme';
import type { Market } from './types';

/** PriceLevel.type → 中文短标签（与 ChartCanvas 内 昨收/现价 同层的图内微标签，沿用硬编码中文） */
const LEVEL_TYPE_LABEL: Record<PriceLevel['type'], string> = {
  support: '支撑',
  resistance: '阻力',
  target: '目标价',
  stopLoss: '止损',
};

/** PriceLevel.source → 括注（推导来源）；未知来源不加括注 */
const LEVEL_SOURCE_LABEL: Record<string, string> = {
  boll_lower: 'BOLL下轨',
  boll_upper: 'BOLL上轨',
  valuation: 'DCF估值',
  atr: 'ATR',
};

function levelTitle(lv: PriceLevel): string {
  const base = LEVEL_TYPE_LABEL[lv.type];
  const src = LEVEL_SOURCE_LABEL[lv.source];
  return src ? `${base} (${src})` : base;
}

interface OverlayParams {
  data: KlinePoint[];
  market: Market;
  levels?: PriceLevel[];
  backtestTrades?: TradeRecord[];
  equityCurve?: { time: number; value: number }[];
}

/**
 * K 线叠加层（AI 关键价位线 + 回测买卖点/净值曲线），从 ChartCanvas 抽出以收敛组件行数。
 * candleRef/equityRef/levelLinesRef 均为 ChartCanvas 持有的稳定 ref（随图表重建刷新），series
 * 的创建/销毁由 ChartCanvas 的 mount effect 统一管理，这里只负责数据/句柄更新，避免内存泄漏。
 */
export function useChartOverlays(
  candleRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>,
  equityRef: MutableRefObject<ISeriesApi<'Line'> | null>,
  levelLinesRef: MutableRefObject<IPriceLine[]>,
  { data, market, levels, backtestTrades, equityCurve }: OverlayParams,
): void {
  // 合并「回测买卖点 + 现」为一组 marker：setMarkers 整体替换，须一次性排序后喂入
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    const lo = data[0]?.time;
    const hi = data[data.length - 1]?.time;
    const markers: SeriesMarker<UTCTimestamp>[] = [];

    // 买卖点：仅保留落在当前 K 线时间窗内的交易，range 与回测窗口不一致时降级裁剪
    if (lo != null && hi != null) {
      for (const tr of backtestTrades ?? []) {
        if (tr.date < lo || tr.date > hi) continue;
        const isBuy = tr.type === 'buy';
        markers.push({
          time: tr.date as UTCTimestamp,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? CHART_THEME.buyMarker : CHART_THEME.sellMarker,
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: isBuy ? '买' : '卖',
        });
      }
    }

    // 「现」marker：始终标注最后一根 K 线，让用户一眼定位当前 K 线
    const last = data[data.length - 1];
    if (last) {
      const isUp = last.close >= last.open;
      markers.push({
        time: last.time as UTCTimestamp,
        position: isUp ? 'aboveBar' : 'belowBar',
        color: isUp ? upColor(market) : downColor(market),
        shape: isUp ? 'arrowDown' : 'arrowUp',
        text: '现',
      });
    }

    // lightweight-charts v4 要求 marker 按时间升序
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    candle.setMarkers(markers);
  }, [data, backtestTrades, market]);

  // AI 关键价位线：清旧句柄再画，防重复叠加/内存泄漏（market 变→图表重建→candleRef 刷新后重跑）
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    for (const line of levelLinesRef.current) candle.removePriceLine(line);
    levelLinesRef.current = [];
    for (const lv of levels ?? []) {
      if (!Number.isFinite(lv.price)) continue;
      levelLinesRef.current.push(
        candle.createPriceLine({
          price: lv.price,
          color: CHART_THEME.levelColors[lv.type],
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: levelTitle(lv),
        }),
      );
    }
  }, [levels, market]);

  // 回测净值曲线：裁剪到当前 K 线时间窗，空数组即清除（未跑回测/切 symbol 时自动消失）
  useEffect(() => {
    const series = equityRef.current;
    if (!series) return;
    const lo = data[0]?.time;
    const hi = data[data.length - 1]?.time;
    const pts =
      lo != null && hi != null
        ? (equityCurve ?? [])
            .filter((p) => p.time >= lo && p.time <= hi)
            .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
        : [];
    series.setData(pts);
  }, [equityCurve, data, market]);
}
