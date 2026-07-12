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
