import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useQuantData } from './useQuantData';
import { createMockQuantBundle } from '../../shared/test-utils';

describe('useQuantData', () => {
  it('初始状态为 idle', () => {
    const fetcher = vi.fn(async () => createMockQuantBundle());
    const { result } = renderHook(() => useQuantData('', fetcher));
    expect(result.current.step).toBe('idle');
    expect(result.current.quant).toBeNull();
  });

  it('有 symbol 时自动 fetch', async () => {
    const bundle = createMockQuantBundle({ symbol: 'AAPL' });
    const fetcher = vi.fn(async () => bundle);
    const { result } = renderHook(() => useQuantData('AAPL', fetcher));

    await waitFor(() => expect(result.current.step).toBe('ready'));
    expect(result.current.quant).toEqual(bundle);
    expect(result.current.error).toBeNull();
  });

  it('fetch 失败时 step 为 error', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('网络错误');
    });
    const { result } = renderHook(() => useQuantData('AAPL', fetcher));

    await waitFor(() => expect(result.current.step).toBe('error'));
    expect(result.current.error).toBe('网络错误');
    expect(result.current.quant).toBeNull();
  });

  it('symbol 变化时重新 fetch', async () => {
    const fetcher = vi.fn(async (sym: string) => createMockQuantBundle({ symbol: sym }));
    const { result, rerender } = renderHook(({ sym }) => useQuantData(sym, fetcher), {
      initialProps: { sym: 'AAPL' },
    });

    await waitFor(() => expect(result.current.step).toBe('ready'));
    expect(result.current.quant?.symbol).toBe('AAPL');

    rerender({ sym: '601012' });
    await waitFor(() => expect(result.current.quant?.symbol).toBe('601012'));
  });
});
