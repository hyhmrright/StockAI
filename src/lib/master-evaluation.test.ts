import { describe, it, expect } from 'vitest';
import { evaluateMasterSignals, simulateMasterPortfolio } from './master-evaluation';
import type { MasterSignalRecord, KlinePoint } from '../../shared/types';
const signal = (p: Partial<MasterSignalRecord> = {}): MasterSignalRecord => ({
  id: 1,
  masterId: 'm',
  symbol: 'A',
  signal: 'bullish',
  confidence: 80,
  priceAt: 100,
  recordedAt: 1000,
  ...p,
});
const bars = (length: number): KlinePoint[] =>
  Array.from({ length }, (_, i) => ({
    time: 2 + i,
    open: 100 + i,
    close: 100 + i,
    high: 101 + i,
    low: 99 + i,
    volume: 10,
  }));
describe('master evaluation', () => {
  it('requires a complete fixed horizon, excludes immature signals', () => {
    expect(evaluateMasterSignals([signal()], { A: bars(5) }, 5).resolvedSignals).toBe(0);
    const row = evaluateMasterSignals([signal()], { A: bars(6) }, 5).leaderboard[0];
    expect(row.resolved).toBe(1);
    expect(row.avgReturn).toBeCloseTo(0.05);
  });
  it('overlapping identical signals do not compound the same return', () => {
    const r = evaluateMasterSignals([signal(), signal({ id: 2 })], { A: bars(6) }, 5);
    expect(r.navCurves.m[1].value).toBeCloseTo(1.05);
  });
  it('bearish signals score correctly but simulations remain long only', () => {
    const s = signal({ signal: 'bearish' });
    expect(evaluateMasterSignals([s], { A: bars(6) }, 5).leaderboard[0].avgReturn).toBeCloseTo(
      -0.05,
    );
    expect(simulateMasterPortfolio([s], { A: bars(6) }).every((p) => p.value === 1)).toBe(true);
  });
  it('new bullish signals while already invested cannot multiply exposure', () => {
    const a = simulateMasterPortfolio([signal()], { A: bars(6) }, 10000, 0);
    const b = simulateMasterPortfolio(
      [signal(), signal({ id: 2, recordedAt: 2000 })],
      { A: bars(6) },
      10000,
      0,
    );
    expect(a[a.length - 1].value).toBeCloseTo(b[b.length - 1].value);
  });
});
