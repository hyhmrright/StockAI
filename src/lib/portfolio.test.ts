import { describe, it, expect } from 'vitest';
import { buildOverview, mergeCost } from './portfolio';
import type { Position, RealtimeQuote } from '../../shared/types';

function pos(symbol: string, shares: number, costPrice: number, id = 1): Position {
  return { id, symbol, shares, costPrice, openedAt: 0 };
}

function quote(
  symbol: string,
  price: number,
  prevClose = price,
  currency: 'CNY' | 'USD' = 'USD',
): RealtimeQuote {
  return {
    symbol,
    name: symbol,
    price,
    change: price - prevClose,
    changePercent: 0,
    open: price,
    high: price,
    low: price,
    prevClose,
    volume: 0,
    amount: 0,
    timestamp: 0,
    currency,
    market: currency === 'CNY' ? 'A股' : '美股',
  };
}

describe('mergeCost 加仓的加权平均', () => {
  it('按份额加权，不是两个价格的算术平均', () => {
    // 100 股 @10 + 300 股 @20 → 均价 17.5，不是 15
    expect(mergeCost({ shares: 100, costPrice: 10 }, { shares: 300, costPrice: 20 })).toEqual({
      shares: 400,
      costPrice: 17.5,
    });
  });

  it('总份额为 0 时不产出 NaN', () => {
    expect(mergeCost({ shares: 0, costPrice: 0 }, { shares: 0, costPrice: 50 })).toEqual({
      shares: 0,
      costPrice: 0,
    });
  });
});

describe('buildOverview 组合估值', () => {
  it('空组合产出空结果，不抛也不造零值汇总', () => {
    expect(buildOverview([], {})).toEqual({ summaries: [], valuations: [], unpriced: [] });
  });

  it('单笔：市值/浮盈/收益率/当日盈亏', () => {
    const { valuations, summaries } = buildOverview([pos('AAPL', 100, 150)], {
      AAPL: quote('AAPL', 180, 175),
    });

    const v = valuations[0];
    expect(v.cost).toBe(15_000);
    expect(v.marketValue).toBe(18_000);
    expect(v.pnl).toBe(3_000);
    expect(v.pnlPercent).toBeCloseTo(20);
    expect(v.dayPnl).toBe(500); // (180 - 175) × 100
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalPnl).toBe(3_000);
  });

  it('A 股与美股分币种汇总，绝不相加', () => {
    // 没有汇率源，把 CNY 和 USD 加起来只是在编一个没有意义的数字
    const { summaries } = buildOverview([pos('600519', 100, 1600, 1), pos('AAPL', 10, 150, 2)], {
      '600519': quote('600519', 1700, 1700, 'CNY'),
      AAPL: quote('AAPL', 180, 180, 'USD'),
    });

    expect(summaries).toHaveLength(2);
    const cny = summaries.find((s) => s.currency === 'CNY')!;
    const usd = summaries.find((s) => s.currency === 'USD')!;
    expect(cny.totalValue).toBe(170_000);
    expect(usd.totalValue).toBe(1_800);
  });

  it('取不到价的持仓完全不进汇总，并被显式列出', () => {
    // 回归保护：把它的成本计入总成本、市值记 0，组合会凭空显示一笔巨亏
    const { summaries, unpriced, valuations } = buildOverview(
      [pos('AAPL', 100, 150, 1), pos('DEAD', 100, 999, 2)],
      { AAPL: quote('AAPL', 180) },
    );

    expect(unpriced).toEqual(['DEAD']);
    expect(summaries[0].totalCost).toBe(15_000); // 不含 DEAD 的 99900
    expect(summaries[0].positionCount).toBe(1);
    // 但逐笔里仍有它，且成本可见——只是估值字段留空
    expect(valuations[1].cost).toBe(99_900);
    expect(valuations[1].marketValue).toBeUndefined();
    expect(valuations[1].pnl).toBeUndefined();
  });

  it('成本为 0 时收益率留空，而不是 Infinity', () => {
    const { valuations } = buildOverview([pos('AAPL', 100, 0)], { AAPL: quote('AAPL', 180) });
    expect(valuations[0].pnl).toBe(18_000);
    expect(valuations[0].pnlPercent).toBeUndefined();
  });

  it('权重按同币种市值占比，跨币种不混算', () => {
    const { valuations } = buildOverview(
      [pos('AAPL', 100, 1, 1), pos('MSFT', 300, 1, 2), pos('600519', 1, 1, 3)],
      {
        AAPL: quote('AAPL', 1, 1, 'USD'),
        MSFT: quote('MSFT', 1, 1, 'USD'),
        '600519': quote('600519', 1, 1, 'CNY'),
      },
    );

    expect(valuations[0].weight).toBeCloseTo(25); // 100 / 400，A 股那 1 股不参与
    expect(valuations[1].weight).toBeCloseTo(75);
    expect(valuations[2].weight).toBeCloseTo(100); // CNY 桶里只有它
  });

  it('全部取不到价时汇总为空而非零值汇总', () => {
    // 返回一个 totalValue=0 的汇总会让 UI 显示"组合市值 0"，看着像亏光了
    const { summaries, unpriced } = buildOverview([pos('AAPL', 100, 150)], {});
    expect(summaries).toEqual([]);
    expect(unpriced).toEqual(['AAPL']);
  });
});
