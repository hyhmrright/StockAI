export type { BacktestResult, TradeRecord } from '../../shared/types';

export interface BacktestConfig {
  symbol: string;
  period: number; // 评分回看天数（如 252）
  buyThreshold: number; // 合成分高于此值 → 买入（默认 65）
  sellThreshold: number; // 合成分低于此值 → 卖出（默认 40）
  initialCapital: number; // 起始资金（默认 100000）
  transactionCost: number; // 单笔交易费率（默认 0.001 = 0.1%）
}
