import { describe, test, expect } from 'bun:test';
import { runBacktest } from './engine';
import type { KlinePoint } from '../../shared/types';

function generateTrendingKline(days: number, startPrice: number, endPrice: number): KlinePoint[] {
  const points: KlinePoint[] = [];
  const dailyReturn = (endPrice / startPrice) ** (1 / days) - 1;
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const noise = price * 0.005 * (Math.random() * 2 - 1);
    const close = price * (1 + dailyReturn) + noise;
    points.push({
      time: 1700000000 + i * 86400,
      open: price,
      high: Math.max(price, close) * 1.005,
      low: Math.min(price, close) * 0.995,
      close,
      volume: 1000000,
    });
    price = close;
  }
  return points;
}

describe('runBacktest', () => {
  test('returns result with equity curve', () => {
    const kline = generateTrendingKline(200, 100, 130);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 200,
      buyThreshold: 55,
      sellThreshold: 45,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.symbol).toBe('TEST');
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.totalReturn).toBeDefined();
    expect(result.buyAndHoldReturn).toBeGreaterThan(0);
    expect(typeof result.maxDrawdown).toBe('number');
    expect(typeof result.sharpeRatio).toBe('number');
  });

  test('returns zero trades with extreme thresholds', () => {
    const kline = generateTrendingKline(100, 100, 110);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 100,
      buyThreshold: 99,
      sellThreshold: 1,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.totalTrades).toBe(0);
    expect(result.totalReturn).toBe(0);
  });

  test('rejects insufficient data', () => {
    const kline = generateTrendingKline(20, 100, 105);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 20,
      buyThreshold: 60,
      sellThreshold: 40,
      initialCapital: 100000,
      transactionCost: 0.001,
    });
    expect(result.totalTrades).toBe(0);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });

  // 前端叠加层直接消费 trades（买卖箭头）与 equityCurve（净值曲线），锁定其结构契约
  test('trades 与 equityCurve 结构契约（前端叠加层依赖）', () => {
    const kline = generateTrendingKline(200, 100, 150);
    const result = runBacktest(kline, {
      symbol: 'TEST',
      period: 200,
      buyThreshold: 55,
      sellThreshold: 45,
      initialCapital: 100000,
      transactionCost: 0.001,
    });

    // 强上涨行情至少触发一次买入（含末尾强制平仓）
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.trades.length).toBe(result.totalTrades);

    for (const t of result.trades) {
      expect(['buy', 'sell']).toContain(t.type);
      expect(Number.isFinite(t.date)).toBe(true); // 真实交易日 Unix 秒，供 marker 对齐
      expect(Number.isFinite(t.price)).toBe(true);
      expect(Number.isFinite(t.shares)).toBe(true);
      expect(Number.isFinite(t.value)).toBe(true);
      expect(Number.isFinite(t.score)).toBe(true);
    }

    // trades 按交易日升序（前端 setMarkers 要求时间升序）
    for (let i = 1; i < result.trades.length; i++) {
      expect(result.trades[i].date).toBeGreaterThanOrEqual(result.trades[i - 1].date);
    }

    // equityCurve 每点 {time, value} 均为有限值，且时间升序
    expect(result.equityCurve.length).toBeGreaterThan(0);
    for (const p of result.equityCurve) {
      expect(Number.isFinite(p.time)).toBe(true);
      expect(Number.isFinite(p.value)).toBe(true);
    }
    for (let i = 1; i < result.equityCurve.length; i++) {
      expect(result.equityCurve[i].time).toBeGreaterThanOrEqual(result.equityCurve[i - 1].time);
    }
  });
});

/** 确定性的单调上涨序列——不掺随机数，好让下面两条断言是硬结论而非概率事件 */
function risingKline(days: number, startPrice = 100, dailyPct = 0.01): KlinePoint[] {
  const points: KlinePoint[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const close = price * (1 + dailyPct);
    points.push({
      time: 1700000000 + i * 86400,
      open: price,
      high: close,
      low: price,
      close,
      volume: 1_000_000,
    });
    price = close;
  }
  return points;
}

describe('runBacktest 的费后口径', () => {
  test('胜率按扣费后的实际盈亏算，不是比两端价格', () => {
    // buyThreshold=0 / sellThreshold=100 让信号必然满足，交易被强制成逐 bar 买卖交替，
    // 于是这条断言不依赖技术指标怎么算。价格一路上涨 ⇒ 每笔卖价都高于买价，
    // 但 20% 的单边费率让任何一轮往返都是净亏。
    // 比价格的旧口径会把它们全判成盈利单，胜率 100%；实际一单没赚。
    const result = runBacktest(risingKline(300), {
      symbol: 'TEST',
      period: 300,
      buyThreshold: 0,
      sellThreshold: 100,
      initialCapital: 100_000,
      transactionCost: 0.2,
    });

    expect(result.totalTrades).toBeGreaterThan(2);
    expect(result.totalReturn).toBeLessThan(0);
    expect(result.winRate).toBe(0);
  });

  test('净值曲线终点与 totalReturn 同口径（都含平仓费）', () => {
    // sellThreshold=-1 永不触发卖出 ⇒ 一路持有到末尾强制平仓，正好覆盖那条订正路径。
    // 循环里压进曲线的是毛市值，不订正的话终点会比 totalReturn 高出一笔手续费，
    // 前端把数字和曲线画在一起时对不上。
    const initialCapital = 100_000;
    const result = runBacktest(risingKline(300), {
      symbol: 'TEST',
      period: 300,
      buyThreshold: 0,
      sellThreshold: -1,
      initialCapital,
      transactionCost: 0.001,
    });

    const last = result.equityCurve[result.equityCurve.length - 1];
    const implied = initialCapital * (1 + result.totalReturn);
    // 容差取本金的万分之一：totalReturn 只保留 4 位小数，本身就有这个量级的舍入
    expect(Math.abs(last.value - implied)).toBeLessThan(initialCapital * 1e-4);
  });
});
