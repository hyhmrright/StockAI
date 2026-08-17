import type { KlinePeriod, KlineRange, Market } from '../../../shared/types';

// 子系统内部一律 `from './types'` 取 Market，但定义只有 shared 一处——
// 这里只做转发，不要在此重新声明字面量联合（市场集合扩容时会漂移成两套）。
export type { Market };

export type SubChartIndicator = 'macd' | 'rsi' | 'kdj' | 'boll' | 'obv' | 'vwap';

export interface ChartConfig {
  range: KlineRange;
  logScale: boolean;
  adjust: 'qfq' | 'hfq' | 'none';
  subIndicator: SubChartIndicator;
  showMA: { short: boolean; mid: boolean; long: boolean };
  compareSymbol?: string;
}

export const DEFAULT_CONFIG: ChartConfig = {
  range: '1y',
  logScale: false,
  adjust: 'qfq',
  subIndicator: 'macd',
  showMA: { short: true, mid: true, long: true },
};

/** 时间范围 → K 线粒度映射 */
export function rangeToPeriod(range: KlineRange): KlinePeriod {
  switch (range) {
    case '1d':
      return '1m';
    case '5d':
      return '5m';
    case '5y':
      return '1w';
    case 'all':
      return '1mo';
    default:
      return '1d';
  }
}

/** 按市场返回三档均线周期（A 股 5/20/60；美股 20/50/200） */
export function maPeriodsForMarket(market: Market): {
  short: number;
  mid: number;
  long: number;
} {
  return market === 'A股' ? { short: 5, mid: 20, long: 60 } : { short: 20, mid: 50, long: 200 };
}

export const MA_COLORS = {
  short: '#F5C842',
  mid: '#B388FF',
  long: '#4FC3F7',
} as const;
