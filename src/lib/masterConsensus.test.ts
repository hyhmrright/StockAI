import { describe, it, expect } from 'vitest';
import { computeMasterConsensus } from './masterConsensus';
import type { MasterSignal } from '../../shared/types';

function sig(signal: MasterSignal['signal']): MasterSignal {
  return { masterId: 'x', signal, confidence: 60, reasoning: '' };
}

describe('computeMasterConsensus', () => {
  it('9 看涨 4 看跌 0 中性', () => {
    const signals = [
      ...Array(9)
        .fill(0)
        .map(() => sig('bullish')),
      ...Array(4)
        .fill(0)
        .map(() => sig('bearish')),
    ];
    const c = computeMasterConsensus(signals);
    expect(c.total).toBe(13);
    expect(c.bullish).toBe(9);
    expect(c.bearish).toBe(4);
    expect(c.neutral).toBe(0);
    expect(c.bullishPct).toBe(69); // round(9/13*100)
    expect(c.bearishPct).toBe(31);
  });

  it('全中立', () => {
    const c = computeMasterConsensus([sig('neutral'), sig('neutral')]);
    expect(c.neutral).toBe(2);
    expect(c.neutralPct).toBe(100);
    expect(c.bullishPct).toBe(0);
  });

  it('空数组安全（不除零）', () => {
    const c = computeMasterConsensus([]);
    expect(c.total).toBe(0);
    expect(c.bullishPct).toBe(0);
    expect(c.bearishPct).toBe(0);
    expect(c.neutralPct).toBe(0);
  });

  it('不均匀分布下三占比之和恒为 100', () => {
    // 1/1/1 独立 round 会得 33+33+33=99，余数补偿后应为 100
    const c = computeMasterConsensus([sig('bullish'), sig('bearish'), sig('neutral')]);
    expect(c.bullishPct + c.bearishPct + c.neutralPct).toBe(100);
  });
});
