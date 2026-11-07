import { describe, it, expect, vi } from 'vitest';
import { loadMasterEvaluation, deriveMasterWeights } from './masterPortfolio';
import type { MasterSignalRecord, KlinePoint } from '../../shared/types';
const signal = (p: Partial<MasterSignalRecord> = {}): MasterSignalRecord => ({
  id: 1,
  masterId: 'a',
  symbol: 'A',
  signal: 'bullish',
  confidence: 80,
  recordedAt: 1000,
  priceAt: 100,
  ...p,
});
const history: Record<string, KlinePoint[]> = {
  A: Array.from({ length: 21 }, (_, i) => ({
    time: 2 + i,
    open: 100,
    close: 100 + i,
    high: 120,
    low: 99,
    volume: 100,
  })),
};
describe('master evaluation pipeline', () => {
  it('empty histories do not make network requests', async () => {
    const fetch = vi.fn();
    expect((await loadMasterEvaluation(async () => [], fetch)).totalSignals).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('derives weights only from mature directional samples', async () => {
    const result = await loadMasterEvaluation(
      async () => [signal(), signal({ id: 2, masterId: 'b', signal: 'neutral' })],
      async () => history,
    );
    expect(deriveMasterWeights(result)).toEqual([{ masterId: 'a', sampleSize: 1, hits: 1 }]);
    expect(result.leaderboard[1].pending).toBe(1);
  });
  it('filters model versions before loading prices and measuring performance', async () => {
    const signals = [signal({ modelFingerprint: 'v1' }), signal({ id: 2, modelFingerprint: 'v2' })],
      fetch = vi.fn(async () => history);
    const result = await loadMasterEvaluation(async () => signals, fetch, 20, 'v2');
    expect(result.totalSignals).toBe(1);
    expect(fetch).toHaveBeenCalledWith([signals[1]]);
  });
  it('missing symbols remain pending rather than silently losing samples', async () => {
    const result = await loadMasterEvaluation(
      async () => [signal()],
      async () => ({}),
    );
    expect(result.leaderboard[0].pending).toBe(1);
    expect(deriveMasterWeights(result)).toEqual([]);
  });
});
