import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useScreener } from './useScreener';
import type { QuantBundle } from '../../shared/types';

function makeQuant(symbol: string, score: number): QuantBundle {
  return {
    symbol,
    technical: { signal: 'bullish', confidence: 0.8, details: {} },
    fundamental: { signal: 'neutral', confidence: 0.6, details: {} },
    composite: { signal: 'bullish', score },
    fetchedAt: Date.now(),
  };
}

describe('useScreener', () => {
  it('scans watchlist items and returns sorted results', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeQuant('AAPL', 6.5))
      .mockResolvedValueOnce(makeQuant('TSLA', 8.2))
      .mockResolvedValueOnce(makeQuant('MSFT', 7.1));

    const { result } = renderHook(() => useScreener(fetcher));

    act(() => {
      result.current.scan([
        { sym: 'AAPL', name: 'Apple' },
        { sym: 'TSLA', name: 'Tesla' },
        { sym: 'MSFT', name: 'Microsoft' },
      ]);
    });

    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.results).toHaveLength(3);
    expect(result.current.results[0].symbol).toBe('TSLA');
    expect(result.current.results[1].symbol).toBe('MSFT');
    expect(result.current.results[2].symbol).toBe('AAPL');
    expect(result.current.progress).toEqual({ done: 3, total: 3 });
  });

  it('updates progress during scan', async () => {
    let resolveFirst: (v: QuantBundle) => void;
    let resolveSecond: (v: QuantBundle) => void;
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<QuantBundle>((r) => {
          resolveFirst = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise<QuantBundle>((r) => {
          resolveSecond = r;
        }),
      );

    const { result } = renderHook(() => useScreener(fetcher));

    act(() => {
      result.current.scan([
        { sym: 'AAPL', name: 'Apple' },
        { sym: 'TSLA', name: 'Tesla' },
      ]);
    });

    expect(result.current.scanning).toBe(true);
    expect(result.current.progress).toEqual({ done: 0, total: 2 });

    await act(async () => resolveFirst!(makeQuant('AAPL', 7)));
    expect(result.current.progress.done).toBe(1);

    await act(async () => resolveSecond!(makeQuant('TSLA', 8)));
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.progress).toEqual({ done: 2, total: 2 });
  });

  it('skips failed stocks and returns partial results', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeQuant('AAPL', 7))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(makeQuant('MSFT', 8));

    const { result } = renderHook(() => useScreener(fetcher));

    act(() => {
      result.current.scan([
        { sym: 'AAPL', name: 'Apple' },
        { sym: 'FAIL', name: 'Fail' },
        { sym: 'MSFT', name: 'Microsoft' },
      ]);
    });

    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.results).toHaveLength(2);
    expect(result.current.progress).toEqual({ done: 3, total: 3 });
  });

  it('abandons previous scan when scan() is called again', async () => {
    let resolveFirst: (v: QuantBundle) => void;
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<QuantBundle>((r) => {
          resolveFirst = r;
        }),
      )
      .mockResolvedValue(makeQuant('TSLA', 9));

    const { result } = renderHook(() => useScreener(fetcher));

    act(() => result.current.scan([{ sym: 'AAPL', name: 'Apple' }]));
    act(() => result.current.scan([{ sym: 'TSLA', name: 'Tesla' }]));

    await act(async () => resolveFirst!(makeQuant('AAPL', 5)));
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].symbol).toBe('TSLA');
  });

  it('clear() resets all state', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeQuant('AAPL', 7));
    const { result } = renderHook(() => useScreener(fetcher));

    act(() => result.current.scan([{ sym: 'AAPL', name: 'Apple' }]));
    await waitFor(() => expect(result.current.scanning).toBe(false));
    expect(result.current.results).toHaveLength(1);

    act(() => result.current.clear());
    expect(result.current.results).toHaveLength(0);
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toEqual({ done: 0, total: 0 });
  });

  it('does nothing for empty items', () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useScreener(fetcher));

    act(() => result.current.scan([]));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.scanning).toBe(false);
  });
});
