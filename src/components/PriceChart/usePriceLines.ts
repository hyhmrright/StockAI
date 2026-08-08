import { useEffect, type MutableRefObject } from 'react';
import { type ISeriesApi, type IPriceLine, LineStyle } from 'lightweight-charts';
import { upColor, downColor } from '../../lib/market-hours';
import { CHART_THEME } from './chart-theme';
import type { Market } from './types';

interface PriceLineParams {
  prevClose?: number;
  currentPrice?: number;
  market: Market;
}

/**
 * 关键水平线：昨收虚线 + 现价实线（标签实时跟随）。从 ChartCanvas 抽出以收敛组件行数。
 * 每次重画前必须先按句柄移除旧线——lightweight-charts 的 createPriceLine 是追加语义，
 * 不清旧会随每次报价刷新不断叠加同一条线（视觉重影 + 句柄泄漏）。
 */
export function usePriceLines(
  candleRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>,
  priceLinesRef: MutableRefObject<{ prev?: IPriceLine; current?: IPriceLine }>,
  { prevClose, currentPrice, market }: PriceLineParams,
): void {
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;

    const pl = priceLinesRef.current;
    if (pl.prev) {
      candle.removePriceLine(pl.prev);
      pl.prev = undefined;
    }
    if (pl.current) {
      candle.removePriceLine(pl.current);
      pl.current = undefined;
    }

    if (prevClose != null)
      pl.prev = candle.createPriceLine({
        price: prevClose,
        color: CHART_THEME.prevCloseLine,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '昨收',
      });
    if (currentPrice != null) {
      const color =
        prevClose == null || currentPrice >= prevClose ? upColor(market) : downColor(market);
      pl.current = candle.createPriceLine({
        price: currentPrice,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: '现价',
      });
    }
  }, [prevClose, currentPrice, market]);
}
