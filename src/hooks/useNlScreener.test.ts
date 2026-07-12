import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNlScreener } from './useNlScreener';
import { ServiceError } from '../lib/ipc';
import type { ScreenResponse } from '../../shared/types';

function makeResponse(): ScreenResponse {
  return {
    query: {
      conditions: [{ field: 'roe', op: 'gte', value: 15 }],
      board: 'main',
      limit: 30,
    },
    matches: [
      {
        symbol: '600519',
        name: '贵州茅台',
        snapshot: { symbol: '600519', name: '贵州茅台', price: 1685.5, pe: 18.4, pb: 6.9 },
        quant: {
          symbol: '600519',
          technical: { signal: 'bullish', confidence: 70, details: {} },
          fundamental: { signal: 'bullish', confidence: 82, details: {} },
          composite: { signal: 'bullish', score: 78 },
          fetchedAt: 0,
        },
      },
    ],
    scannedCoarse: 12,
    refinedCount: 3,
    fetchedAt: 0,
  };
}

describe('useNlScreener', () => {
  it('run() sets response on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('ROE大于15的主板股票'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledWith('ROE大于15的主板股票');
    expect(result.current.response?.matches).toHaveLength(1);
    expect(result.current.errorKey).toBeNull();
  });

  it('trims query before dispatch', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('  ROE大于15  '));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledWith('ROE大于15');
  });

  it('does nothing for empty / whitespace query', () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('   '));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('maps ERR_SCREEN_PARSE to parse error key', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ServiceError('ERR_SCREEN_PARSE', 'bad json'));
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('今天天气如何'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('screener_err_parse');
    expect(result.current.response).toBeNull();
  });

  it('maps ERR_SCREEN_NO_CONDITIONS to no-conditions error key', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ServiceError('ERR_SCREEN_NO_CONDITIONS', 'no conditions'));
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('随便看看'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('screener_err_no_conditions');
  });

  it('falls back to generic error key for unknown codes / plain errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('ROE大于15'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorKey).toBe('screener_err_generic');
  });

  it('clear() resets all state', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('ROE大于15'));
    await waitFor(() => expect(result.current.response).not.toBeNull());

    act(() => result.current.clear());
    expect(result.current.response).toBeNull();
    expect(result.current.errorKey).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('ignores a stale in-flight result after clear()', async () => {
    let resolve: (v: ScreenResponse) => void = () => {};
    const fetcher = vi.fn().mockReturnValue(
      new Promise<ScreenResponse>((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useNlScreener(fetcher));

    act(() => result.current.run('ROE大于15'));
    act(() => result.current.clear());
    await act(async () => resolve(makeResponse()));

    // clear 已作废该请求，迟到的成功结果不得写回
    expect(result.current.response).toBeNull();
  });
});
