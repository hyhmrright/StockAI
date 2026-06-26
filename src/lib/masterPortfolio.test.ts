import { describe, it, expect } from 'vitest';
import { computeMasterPortfolio } from './masterPortfolio';
import type { MasterSignalRecord } from '../../shared/types';

// 测试构造助手：默认值齐全，按需覆写
function sig(over: Partial<MasterSignalRecord>): MasterSignalRecord {
  return {
    id: 1,
    masterId: 'warren-buffett',
    symbol: 'AAPL',
    signal: 'bullish',
    confidence: 80,
    priceAt: 100,
    recordedAt: 1_000,
    ...over,
  };
}

describe('computeMasterPortfolio', () => {
  it('空输入返回空聚合', () => {
    const r = computeMasterPortfolio([], {}, 9_999);
    expect(r.totalSignals).toBe(0);
    expect(r.resolvedSignals).toBe(0);
    expect(r.leaderboard).toEqual([]);
    expect(r.navCurves).toEqual({});
    expect(r.firstSignalAt).toBeNull();
    expect(r.asOf).toBe(9_999);
  });

  it('看涨且涨 → 命中，收益为正向涨幅', () => {
    const r = computeMasterPortfolio([sig({ priceAt: 100 })], { AAPL: 110 }, 2_000);
    const e = r.leaderboard[0];
    expect(e.resolved).toBe(1);
    expect(e.hits).toBe(1);
    expect(e.hitRate).toBe(1);
    expect(e.avgReturn).toBeCloseTo(0.1, 6);
    expect(r.resolvedSignals).toBe(1);
  });

  it('看跌且跌 → 命中（方向调整后收益为正）', () => {
    const r = computeMasterPortfolio(
      [sig({ signal: 'bearish', priceAt: 100 })],
      { AAPL: 90 },
      2_000,
    );
    const e = r.leaderboard[0];
    expect(e.hits).toBe(1);
    expect(e.hitRate).toBe(1);
    expect(e.avgReturn).toBeCloseTo(0.1, 6);
  });

  it('看涨却跌 → 未命中，方向调整收益为负', () => {
    const r = computeMasterPortfolio([sig({ priceAt: 100 })], { AAPL: 90 }, 2_000);
    const e = r.leaderboard[0];
    expect(e.resolved).toBe(1);
    expect(e.hits).toBe(0);
    expect(e.hitRate).toBe(0);
    expect(e.avgReturn).toBeCloseTo(-0.1, 6);
  });

  it('中性 signal 计入 total/pending 但不裁决', () => {
    const r = computeMasterPortfolio([sig({ signal: 'neutral' })], { AAPL: 110 }, 2_000);
    const e = r.leaderboard[0];
    expect(e.total).toBe(1);
    expect(e.pending).toBe(1);
    expect(e.resolved).toBe(0);
    expect(e.hitRate).toBeNull();
    expect(e.avgReturn).toBeNull();
    expect(r.resolvedSignals).toBe(0);
  });

  it('缺入场价或缺现价 → 待定，不纳入统计', () => {
    const noEntry = computeMasterPortfolio([sig({ priceAt: null })], { AAPL: 110 }, 2_000);
    expect(noEntry.leaderboard[0].resolved).toBe(0);
    expect(noEntry.leaderboard[0].pending).toBe(1);

    const noQuote = computeMasterPortfolio([sig({ priceAt: 100 })], {}, 2_000);
    expect(noQuote.leaderboard[0].resolved).toBe(0);
    expect(noQuote.leaderboard[0].pending).toBe(1);
  });

  it('净值曲线按时间顺序等额全仓复利', () => {
    const signals = [
      sig({ id: 1, symbol: 'AAPL', priceAt: 100, recordedAt: 1_000 }), // +10%
      sig({ id: 2, symbol: 'MSFT', priceAt: 200, recordedAt: 2_000 }), // +10%
    ];
    const r = computeMasterPortfolio(signals, { AAPL: 110, MSFT: 220 }, 3_000);
    const curve = r.navCurves['warren-buffett'];
    expect(curve).toHaveLength(2);
    expect(curve[0]).toEqual({ time: 1_000, value: 1.1 });
    expect(curve[1].time).toBe(2_000);
    expect(curve[1].value).toBeCloseTo(1.21, 6); // 1.1 * 1.1
  });

  it('榜单按命中率降序，null 命中率（全待定）垫底', () => {
    const signals = [
      sig({ id: 1, masterId: 'a', symbol: 'AAPL', signal: 'bullish', priceAt: 100 }), // 命中
      sig({ id: 2, masterId: 'b', symbol: 'AAPL', signal: 'bearish', priceAt: 100 }), // 未命中
      sig({ id: 3, masterId: 'c', symbol: 'AAPL', signal: 'neutral', priceAt: 100 }), // 全待定
    ];
    const r = computeMasterPortfolio(signals, { AAPL: 110 }, 3_000);
    expect(r.leaderboard.map((e) => e.masterId)).toEqual(['a', 'b', 'c']);
    expect(r.leaderboard[0].hitRate).toBe(1);
    expect(r.leaderboard[1].hitRate).toBe(0);
    expect(r.leaderboard[2].hitRate).toBeNull();
  });

  it('firstSignalAt 取最早落账时间', () => {
    const signals = [sig({ id: 1, recordedAt: 5_000 }), sig({ id: 2, recordedAt: 1_500 })];
    const r = computeMasterPortfolio(signals, { AAPL: 110 }, 9_000);
    expect(r.firstSignalAt).toBe(1_500);
  });
});
