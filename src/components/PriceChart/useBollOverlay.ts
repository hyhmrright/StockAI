import { useEffect, type MutableRefObject } from 'react';
import {
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
  LineStyle,
} from 'lightweight-charts';
import type { KlinePoint } from '../../../shared/types';
import { boll } from '../../lib/indicators';
import { CHART_THEME } from './chart-theme';

type BollSeries = { upper: ISeriesApi<'Line'>; mid: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'> };

/**
 * BOLL 上下轨叠加（主图）：按 showBoll 动态增删三条 series 并喂数据。
 * 从 ChartCanvas 抽出以收敛组件行数并隔离「布林带绘制」这一独立关注点；
 * chartRef/bollRef 为稳定 ref 不入 deps，依赖与原实现保持一致。
 */
export function useBollOverlay(
  chartRef: MutableRefObject<IChartApi | null>,
  bollRef: MutableRefObject<BollSeries | null>,
  showBoll: boolean | undefined,
  data: KlinePoint[],
): void {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const bandOpts = { priceLineVisible: false as const, lastValueVisible: false as const };
    if (showBoll && !bollRef.current) {
      bollRef.current = {
        upper: chart.addLineSeries({
          color: CHART_THEME.bollBand,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          ...bandOpts,
        }),
        mid: chart.addLineSeries({ color: CHART_THEME.bollMid, lineWidth: 1, ...bandOpts }),
        lower: chart.addLineSeries({
          color: CHART_THEME.bollBand,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          ...bandOpts,
        }),
      };
    } else if (!showBoll && bollRef.current) {
      const b = bollRef.current;
      chart.removeSeries(b.upper);
      chart.removeSeries(b.mid);
      chart.removeSeries(b.lower);
      bollRef.current = null;
    }
    if (showBoll && bollRef.current && data.length > 0) {
      const { upper, mid, lower } = boll(data.map((p) => p.close));
      const times = data.map((p) => p.time as UTCTimestamp);
      const toLine = (vs: (number | null)[]): LineData<UTCTimestamp>[] =>
        vs
          .map((v, i) => (v == null ? null : { time: times[i], value: v }))
          .filter((x): x is LineData<UTCTimestamp> => x !== null);
      bollRef.current.upper.setData(toLine(upper));
      bollRef.current.mid.setData(toLine(mid));
      bollRef.current.lower.setData(toLine(lower));
    }
  }, [showBoll, data]);
}
