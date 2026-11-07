import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useMasterWeights } from './useMasterWeights';
import { analysisModelFingerprint } from '../../shared/analysis-version';
import { DEFAULT_SETTINGS, PROVIDER_PROFILES } from './useSettings';
import type { MasterSignalRecord, KlinePoint } from '../../shared/types';
const provider = DEFAULT_SETTINGS.activeProvider;
const choice = {
  provider,
  model: DEFAULT_SETTINGS.providerConfigs[provider]?.model ?? PROVIDER_PROFILES[provider].model,
};
const modelFingerprint = analysisModelFingerprint(choice, choice);
const signals: MasterSignalRecord[] = [
  {
    id: 1,
    masterId: 'm',
    symbol: 'A',
    signal: 'bullish',
    confidence: 80,
    priceAt: 100,
    recordedAt: 1000,
    modelFingerprint,
  },
];
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
describe('fixed-horizon master weights', () => {
  it('empty history falls back without requesting prices', async () => {
    const load = vi.fn(async () => []),
      prices = vi.fn(async () => ({}));
    const { result } = renderHook(() => useMasterWeights(load, prices));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current.weights).toEqual([]);
    expect(prices).not.toHaveBeenCalled();
  });
  it('uses completed 20-day outcomes and matching model versions', async () => {
    const { result } = renderHook(() =>
      useMasterWeights(
        async () => signals,
        async () => history,
      ),
    );
    await waitFor(() =>
      expect(result.current.weights).toEqual([{ masterId: 'm', sampleSize: 1, hits: 1 }]),
    );
  });
  it('immature signals do not affect weights', async () => {
    const load = vi.fn(async () => signals);
    const { result } = renderHook(() =>
      useMasterWeights(load, async () => ({ A: history.A.slice(0, 10) })),
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current.weights).toEqual([]);
  });
  it('can refresh safely after new signals have been persisted', async () => {
    const load = vi.fn(async () => signals);
    const { result } = renderHook(() => useMasterWeights(load, async () => history));
    await waitFor(() => expect(result.current.weights).toHaveLength(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('storage errors degrade to default weights', async () => {
    const load = vi.fn(async () => {
      throw new Error('db unavailable');
    });
    const { result } = renderHook(() => useMasterWeights(load, async () => history));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current.weights).toEqual([]);
  });
});
