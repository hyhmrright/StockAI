import type { AnalystSignal } from '../../shared/types';

export type Signal = 'bullish' | 'bearish' | 'neutral';

export interface SubSignal {
  name: string;
  signal: Signal;
  score: number;
  weight: number;
  details: Record<string, number | string>;
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
}
