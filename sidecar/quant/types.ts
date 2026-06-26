import type { AnalystSignal, CheckItem } from '../../shared/types';

export type Signal = 'bullish' | 'bearish' | 'neutral';

export interface SubSignal {
  name: string;
  signal: Signal;
  score: number;
  weight: number;
  details: Record<string, number | string>;
  /** 可下钻的逐项检查（基本面各维提供） */
  checkItems?: CheckItem[];
}

export interface TechnicalResult {
  subSignals: SubSignal[];
  composite: AnalystSignal;
}

export interface FundamentalResult {
  dimensions: SubSignal[];
  composite: AnalystSignal;
}

export interface FinancialMetrics {
  roe?: number;
  grossMargin?: number;
  netMargin?: number;
  debtToAsset?: number;
  currentRatio?: number;
  revenueGrowth?: number;
  netIncomeGrowth?: number;
  pe?: number;
  pb?: number;
  marketCap?: number;
  freeCashFlow?: number;
  operatingCashFlow?: number; // 绝对值（元）；东财字段为每股，见 parseEastmoneyFinancials 注释
  capitalExpenditure?: number;
  depreciation?: number;
  ebitda?: number;
  interestExpense?: number;
  totalDebt?: number;
  cash?: number;
  sharesOutstanding?: number;
  enterpriseValue?: number;
  netIncome?: number;
  revenue?: number;
}
