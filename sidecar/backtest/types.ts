export type { BacktestResult, TradeRecord } from '../../shared/types';

export interface BacktestConfig {
  symbol: string;
  period: number; // 评分回看天数（如 252）
  buyThreshold: number; // 合成分高于此值 → 买入
  sellThreshold: number; // 合成分低于此值 → 卖出
  initialCapital: number; // 起始资金
  transactionCost: number; // 单笔交易费率（0.001 = 0.1%）
}

/**
 * 默认策略参数的唯一来源——CLI handler 等调用方只需补 symbol / period，
 * 不要在调用处内联这些数值。
 */
export const DEFAULT_BACKTEST_PARAMS: Omit<BacktestConfig, 'symbol' | 'period'> = {
  buyThreshold: 65,
  sellThreshold: 40,
  initialCapital: 100_000,
  transactionCost: 0.001,
};
