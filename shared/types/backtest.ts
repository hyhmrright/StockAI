// 策略回测：交易记录与绩效结果
/** 回测交易记录 */
export interface TradeRecord {
  type: 'buy' | 'sell';
  date: number;
  price: number;
  shares: number;
  value: number;
  score: number;
}

/** 回测结果 */
export interface BacktestResult {
  assumptions?: {
    execution: 'nextOpen' | 'close';
    transactionCost: number;
    slippage: number;
    lotSize: number;
  };
  symbol: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
  buyAndHoldReturn: number;
  trades: TradeRecord[];
  equityCurve: Array<{ time: number; value: number }>;
}

export interface BacktestRequest {
  symbol: string;
  range?: '1y' | '5y' | 'all';
  startDate?: string;
  endDate?: string;
  buyThreshold?: number;
  sellThreshold?: number;
  initialCapital?: number;
  transactionCost?: number;
  slippage?: number;
  lotSize?: number;
  execution?: 'nextOpen' | 'close';
}
