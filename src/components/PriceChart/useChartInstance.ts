import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type IPriceLine,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import type { KlinePoint } from '../../../shared/types';
import { upColor, downColor } from '../../lib/market-hours';
import { useLanguage } from '../../hooks/useLanguage';
import { MA_COLORS, type Market } from './types';
import { CHART_THEME } from './chart-theme';

type LineTriplet = { short: ISeriesApi<'Line'>; mid: ISeriesApi<'Line'>; long: ISeriesApi<'Line'> };
type BollSeries = { upper: ISeriesApi<'Line'>; mid: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'> };

/** 图表实例及其全部 series/句柄的稳定 ref 集合，交给各 overlay hook 按需读写 */
export interface ChartHandles {
  chartRef: MutableRefObject<IChartApi | null>;
  candleRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  volumeRef: MutableRefObject<ISeriesApi<'Histogram'> | null>;
  maRef: MutableRefObject<LineTriplet | null>;
  /** BOLL 三轨按 showBoll 动态增删，故由 useBollOverlay 填充，此处只提供容器 */
  bollRef: MutableRefObject<BollSeries | null>;
  compareRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  equityRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  priceLinesRef: MutableRefObject<{ prev?: IPriceLine; current?: IPriceLine }>;
  levelLinesRef: MutableRefObject<IPriceLine[]>;
}

/**
 * 图表实例的创建与生命周期：建 chart + 全部常驻 series、订阅十字光标、market 变更时整体重建。
 * 从 ChartCanvas 抽出，让组件只保留「喂数据」职责——构造与喂数是两个独立关注点，
 * 且构造逻辑一次性（仅依赖 market），混在数据 effect 之间会掩盖真正的更新路径。
 *
 * 返回的 ref 全部稳定（useRef 创建），重建时由 cleanup 统一置空，避免 overlay hook 摸到已销毁的 series。
 */
export function useChartInstance(
  containerRef: RefObject<HTMLDivElement | null>,
  market: Market,
  compareLabel: string | undefined,
  onCrosshair?: (point: KlinePoint | null) => void,
): ChartHandles {
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maRef = useRef<LineTriplet | null>(null);
  const bollRef = useRef<BollSeries | null>(null);
  const compareRef = useRef<ISeriesApi<'Line'> | null>(null);
  const equityRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<{ prev?: IPriceLine; current?: IPriceLine }>({});
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const crosshairCbRef = useRef(onCrosshair);
  const { t } = useLanguage();

  // 让 ref 始终持有最新的 onCrosshair，避免被 effect 闭包"锁定"
  useEffect(() => {
    crosshairCbRef.current = onCrosshair;
  }, [onCrosshair]);

  // 创建图表 — 仅 market 变更时重建（涨跌配色是建 series 时固化的）。
  // compareLabel 只作初值：重建后的更新由 ChartCanvas 的独立 effect 负责。
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.background },
        textColor: CHART_THEME.text,
      },
      grid: { vertLines: { color: CHART_THEME.grid }, horzLines: { color: CHART_THEME.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });

    const up = upColor(market),
      dn = downColor(market);
    const candle = chart.addCandlestickSeries({
      upColor: up,
      downColor: dn,
      borderUpColor: up,
      borderDownColor: dn,
      wickUpColor: up,
      wickDownColor: dn,
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    // 三条均线 — 颜色由 types.ts 中 MA_COLORS 集中管理
    const maOpts = {
      lineWidth: 1 as const,
      priceLineVisible: false as const,
      lastValueVisible: false as const,
    };
    maRef.current = {
      short: chart.addLineSeries({ color: MA_COLORS.short, ...maOpts }),
      mid: chart.addLineSeries({ color: MA_COLORS.mid, ...maOpts }),
      long: chart.addLineSeries({ color: MA_COLORS.long, ...maOpts }),
    };

    // 比较基准 series — 独立坐标轴避免干扰主图刻度
    compareRef.current = chart.addLineSeries({
      color: CHART_THEME.compareSeries,
      lineWidth: 1,
      priceScaleId: 'compare',
      lastValueVisible: true,
      priceLineVisible: false,
      title: compareLabel ?? 'Compare',
    });
    chart
      .priceScale('compare')
      .applyOptions({ visible: false, scaleMargins: { top: 0.05, bottom: 0.3 } }); // 隐藏第二轴刻度

    // 回测净值 series — 独立隐藏坐标轴，money 量级不污染 K 线刻度（照抄 compare 轴套路）
    equityRef.current = chart.addLineSeries({
      color: CHART_THEME.equityLine,
      lineWidth: 2,
      priceScaleId: 'equity',
      lastValueVisible: false,
      priceLineVisible: false,
      title: t('series_equity'),
    });
    chart
      .priceScale('equity')
      .applyOptions({ visible: false, scaleMargins: { top: 0.1, bottom: 0.35 } });

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
      maRef.current =
        bollRef.current =
        compareRef.current =
        equityRef.current =
        chartRef.current =
        candleRef.current =
        volumeRef.current =
          null;
      priceLinesRef.current = {}; // 清除指向旧 chart 的 IPriceLine handle
      levelLinesRef.current = []; // 同上，清空 AI 价位线句柄
    };
  }, [market]);

  // 净值 series 的标题只在建图时绑定一次，切语言后需单独刷新（与 ChartCanvas 处理 compareLabel 同理，
  // 避免把 t 塞进建图 deps 导致整张图重建）
  useEffect(() => {
    equityRef.current?.applyOptions({ title: t('series_equity') });
  }, [t]);

  return {
    chartRef,
    candleRef,
    volumeRef,
    maRef,
    bollRef,
    compareRef,
    equityRef,
    priceLinesRef,
    levelLinesRef,
  };
}
