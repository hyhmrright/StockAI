import type { KlinePoint } from '../../shared/types';
import type { BacktestConfig, BacktestResult, TradeRecord } from './types';
import { analyzeTechnical } from '../quant/technical';
import { TRADING_DAYS_PER_YEAR, RISK_FREE_RATE } from '../../shared/constants';

const MIN_LOOKBACK = 60;

/** 四舍五入到 4 位小数 */
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** 四舍五入到 2 位小数 */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 将技术合成信号映射到 0-100 分数区间 */
function toScore(signal: string, confidence: number): number {
  if (signal === 'bullish') return 50 + confidence / 2;
  if (signal === 'bearish') return 50 - confidence / 2;
  return 50;
}

/** 从权益曲线计算每日简单收益率序列 */
function dailyReturns(equityCurve: { time: number; value: number }[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    if (prev > 0) result.push((equityCurve[i].value - prev) / prev);
  }
  return result;
}

/** 计算夏普比率（年化） */
function computeSharpe(returns: number[]): number {
  if (returns.length === 0) return 0;
  const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return std > 0
    ? (avg * TRADING_DAYS_PER_YEAR - RISK_FREE_RATE) / (std * Math.sqrt(TRADING_DAYS_PER_YEAR))
    : 0;
}

/** 从权益曲线计算最大回撤（负数） */
function computeMaxDrawdown(equityCurve: { time: number; value: number }[]): number {
  let peak = equityCurve[0]?.value ?? 0;
  let maxDd = 0;
  for (const pt of equityCurve) {
    if (pt.value > peak) peak = pt.value;
    if (peak > 0) {
      const dd = (pt.value - peak) / peak;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function runBacktest(kline: KlinePoint[], config: BacktestConfig): BacktestResult {
  const sorted = [...kline].sort((a, b) => a.time - b.time);
  const { symbol, buyThreshold, sellThreshold, initialCapital, transactionCost } = config;

  // 数据不足时返回空回测结果
  if (sorted.length < MIN_LOOKBACK) {
    const bah =
      sorted.length >= 2
        ? (sorted[sorted.length - 1].close - sorted[0].close) / sorted[0].close
        : 0;
    return {
      symbol,
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalTrades: 0,
      sharpeRatio: 0,
      buyAndHoldReturn: bah,
      trades: [],
      equityCurve: sorted.map((k) => ({ time: k.time, value: initialCapital })),
    };
  }

  const trades: TradeRecord[] = [];
  const equityCurve: { time: number; value: number }[] = [];
  let cash = initialCapital;
  let shares = 0;
  let position: 'none' | 'long' = 'none';

  // 滑动窗口逐 bar 计算技术分，生成买卖信号
  for (let i = MIN_LOOKBACK; i < sorted.length; i++) {
    const window = sorted.slice(Math.max(0, i - 250), i + 1);
    const { composite } = analyzeTechnical(window);
    const score = toScore(composite.signal, composite.confidence);
    const bar = sorted[i];

    if (position === 'none' && score >= buyThreshold) {
      // 买入：全仓投入，扣除交易费
      const investable = cash * (1 - transactionCost);
      if (investable > 0) {
        shares = investable / bar.close;
        cash = 0;
        position = 'long';
        trades.push({
          type: 'buy',
          date: bar.time,
          price: bar.close,
          shares,
          value: investable,
          score: r2(score),
        });
      }
    } else if (position === 'long' && score <= sellThreshold) {
      // 卖出：清仓，扣除交易费
      const proceeds = shares * bar.close * (1 - transactionCost);
      cash = proceeds;
      trades.push({
        type: 'sell',
        date: bar.time,
        price: bar.close,
        shares,
        value: cash,
        score: r2(score),
      });
      shares = 0;
      position = 'none';
    }

    equityCurve.push({ time: bar.time, value: cash + shares * bar.close });
  }

  // 以最后收盘价强制平仓，并记录卖出交易
  if (position === 'long') {
    const lastBar = sorted[sorted.length - 1];
    const proceeds = shares * lastBar.close * (1 - transactionCost);
    trades.push({
      type: 'sell',
      date: lastBar.time,
      price: lastBar.close,
      shares,
      value: proceeds,
      score: 50,
    });
    cash += proceeds;
    shares = 0;
  }

  const totalReturn = (cash - initialCapital) / initialCapital;
  const years = (sorted.length - MIN_LOOKBACK) / TRADING_DAYS_PER_YEAR;
  const annualizedReturn = years > 0 ? (cash / initialCapital) ** (1 / years) - 1 : 0;

  // 胜率：按买卖配对计算
  const buyTrades = trades.filter((t) => t.type === 'buy');
  const sellTrades = trades.filter((t) => t.type === 'sell');
  const wins = sellTrades.filter((s, i) => buyTrades[i] && s.price > buyTrades[i].price).length;
  const winRate = sellTrades.length > 0 ? wins / sellTrades.length : 0;

  const returns = dailyReturns(equityCurve);

  return {
    symbol,
    totalReturn: r4(totalReturn),
    annualizedReturn: r4(annualizedReturn),
    maxDrawdown: r4(computeMaxDrawdown(equityCurve)),
    winRate: r2(winRate),
    totalTrades: trades.length,
    sharpeRatio: r2(computeSharpe(returns)),
    buyAndHoldReturn: r4(
      (sorted[sorted.length - 1].close - sorted[MIN_LOOKBACK].close) / sorted[MIN_LOOKBACK].close,
    ),
    trades,
    equityCurve,
  };
}
