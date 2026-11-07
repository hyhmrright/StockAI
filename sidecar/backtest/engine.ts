import type { KlinePoint } from '../../shared/types';
import type { BacktestConfig, BacktestResult, TradeRecord } from './types';
import { analyzeTechnical } from '../quant/technical';
import { TRADING_DAYS_PER_YEAR, RISK_FREE_RATE } from '../../shared/constants';

/** 回测所需的最少 K 线根数：不足则技术评分的回看窗口填不满，直接拒绝回测 */
export const MIN_BACKTEST_BARS = 60;

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
  if (
    !Number.isFinite(config.initialCapital) ||
    config.initialCapital <= 0 ||
    !Number.isFinite(config.transactionCost) ||
    config.transactionCost < 0 ||
    config.transactionCost >= 1 ||
    !Number.isFinite(config.slippage ?? 0) ||
    (config.slippage ?? 0) < 0 ||
    (config.slippage ?? 0) >= 1 ||
    !Number.isInteger(config.lotSize ?? 1) ||
    (config.lotSize ?? 1) < 1
  )
    throw new Error('无效回测参数');
  if (
    ![config.buyThreshold, config.sellThreshold].every(Number.isFinite) ||
    (config.execution && !['nextOpen', 'close'].includes(config.execution))
  )
    throw new Error('无效策略参数');
  if (
    kline.some(
      (b) =>
        ![b.time, b.open, b.close, b.high, b.low, b.volume].every(Number.isFinite) ||
        b.open <= 0 ||
        b.close <= 0 ||
        b.volume < 0,
    )
  )
    throw new Error('无效 K 线');
  const sorted = [...kline].sort((a, b) => a.time - b.time);
  const { symbol, buyThreshold, sellThreshold, initialCapital, transactionCost } = config;

  // 数据不足时返回空回测结果
  if (sorted.length < MIN_BACKTEST_BARS) {
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
  let entryCash = 0;
  let pendingScore: number | null = null;
  let wins = 0;
  let closed = 0;
  let position: 'none' | 'long' = 'none';

  // 初始资金点纳入回撤；信号在收盘形成，下一根开盘才可成交。
  equityCurve.push({ time: sorted[MIN_BACKTEST_BARS - 1].time, value: initialCapital });

  // 滑动窗口逐 bar 计算技术分，生成买卖信号
  for (let i = MIN_BACKTEST_BARS; i < sorted.length; i++) {
    const window = sorted.slice(Math.max(0, i - 250), i + 1);
    const { composite } = analyzeTechnical(window);
    const currentScore = toScore(composite.signal, composite.confidence);
    const score = config.execution === 'close' ? currentScore : pendingScore;
    pendingScore = currentScore;
    const bar = sorted[i];
    const fill = config.execution === 'close' ? bar.close : bar.open;
    const slip = config.slippage ?? 0;
    const canTrade = bar.volume > 0;

    if (
      canTrade &&
      score != null &&
      position === 'none' &&
      score >= buyThreshold &&
      i < sorted.length - 1
    ) {
      // 买入：全仓投入，扣除交易费
      entryCash = cash;
      const price = fill * (1 + slip);
      const lot = config.lotSize ?? 1;
      const units = Math.floor(cash / (price * (1 + transactionCost)) / lot) * lot;
      const investable = units * price;
      if (investable > 0) {
        shares = units;
        cash -= investable * (1 + transactionCost);
        entryCash -= cash;
        position = 'long';
        trades.push({
          type: 'buy',
          date: bar.time,
          price,
          shares,
          value: investable,
          score: r2(score),
        });
      }
    } else if (canTrade && score != null && position === 'long' && score <= sellThreshold) {
      // 卖出：清仓，扣除交易费
      const price = fill * (1 - slip);
      const proceeds = shares * price * (1 - transactionCost);
      if (proceeds > entryCash) wins++;
      closed++;
      cash += proceeds;
      trades.push({
        type: 'sell',
        date: bar.time,
        price,
        shares,
        value: proceeds,
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
    const proceeds = shares * lastBar.close * (1 - (config.slippage ?? 0)) * (1 - transactionCost);
    if (proceeds > entryCash) wins++;
    closed++;
    trades.push({
      type: 'sell',
      date: lastBar.time,
      price: lastBar.close * (1 - (config.slippage ?? 0)),
      shares,
      value: proceeds,
      score: 50,
    });
    cash += proceeds;
    shares = 0;
    // 曲线最后一点是循环里按毛市值（cash + shares×close）压进去的，没扣平仓费。
    // 不订正的话，图上的净值终点会比报告的 totalReturn 高出一笔手续费——
    // 同一个回测的两个口径对不上，前端把两者画在一起时尤其扎眼。
    if (equityCurve.length > 0) equityCurve[equityCurve.length - 1].value = cash;
  }

  const totalReturn = (cash - initialCapital) / initialCapital;
  const years = (sorted.length - MIN_BACKTEST_BARS) / TRADING_DAYS_PER_YEAR;
  const annualizedReturn = years > 0 ? (cash / initialCapital) ** (1 / years) - 1 : 0;

  const winRate = closed > 0 ? wins / closed : 0;

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
      (sorted[sorted.length - 1].close - sorted[MIN_BACKTEST_BARS].close) /
        sorted[MIN_BACKTEST_BARS].close,
    ),
    trades,
    equityCurve,
    assumptions: {
      execution: config.execution ?? 'nextOpen',
      transactionCost,
      slippage: config.slippage ?? 0,
      lotSize: config.lotSize ?? 1,
    },
  };
}
