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
