import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import type { KlinePoint, PriceLevel, TradeRecord } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';
import { useLanguage, type TFunction } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { CHART_THEME } from './chart-theme';
import type { Market } from './types';

/** PriceLevel.type → 图内短标签的译文 key */
const LEVEL_TYPE_KEY: Record<PriceLevel['type'], TranslationKey> = {
  support: 'level_support',
  resistance: 'level_resistance',
  target: 'level_target',
  stopLoss: 'level_stoploss',
};

/** PriceLevel.source → 括注（推导来源）的译文 key；未收录的来源不加括注 */
const LEVEL_SOURCE_KEY: Record<string, TranslationKey> = {
  boll_lower: 'level_src_boll_lower',
  boll_upper: 'level_src_boll_upper',
  valuation: 'level_src_valuation',
  atr: 'level_src_atr',
};

function levelTitle(lv: PriceLevel, t: TFunction): string {
  const base = t(LEVEL_TYPE_KEY[lv.type]);
  const srcKey = LEVEL_SOURCE_KEY[lv.source];
  return srcKey ? `${base} (${t(srcKey)})` : base;
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
  const { t } = useLanguage();
  // v5 起 marker 是 series 插件：同一 series 只挂一次，之后复用 setMarkers 整体替换。
  // 记住挂载时的 series，图表重建（market 变）后 candleRef 换新，需重新挂而非往旧实例写。
  const markersRef = useRef<{
    series: ISeriesApi<'Candlestick'>;
    api: ISeriesMarkersPluginApi<Time>;
  } | null>(null);

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
          text: isBuy ? t('marker_buy') : t('marker_sell'),
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
        text: t('marker_now'),
      });
    }

    // lightweight-charts 要求 marker 按时间升序
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markersRef.current?.series !== candle) {
      markersRef.current = { series: candle, api: createSeriesMarkers(candle) };
    }
    markersRef.current.api.setMarkers(markers);
  }, [data, backtestTrades, market, t]);

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
          title: levelTitle(lv, t),
        }),
      );
    }
  }, [levels, market, t]);

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
