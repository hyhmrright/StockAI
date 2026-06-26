import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeQuote } from '../../shared/types';

// 模块替身：直接控制 fetchRealtimeQuote 与 isTradingHours，避免依赖网络与真实时钟
vi.mock('../lib/ipc', () => ({
  fetchRealtimeQuote: vi.fn(),
}));
vi.mock('../lib/market-hours', () => ({
  detectMarket: vi.fn(() => '美股'),
  isTradingHours: vi.fn(),
}));

import { useRealtimeQuote } from './useRealtimeQuote';
import { fetchRealtimeQuote } from '../lib/ipc';
import { isTradingHours } from '../lib/market-hours';

const POLL_MS = 10_000;

function buildQuote(overrides: Partial<RealtimeQuote> = {}): RealtimeQuote {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 180,
    change: 1,
    changePercent: 0.5,
    open: 179,
    high: 181,
    low: 178,
    prevClose: 179,
    volume: 1_000_000,
    amount: 180_000_000,
    timestamp: Math.floor(Date.now() / 1000),
    currency: 'USD',
    market: '美股',
    ...overrides,
  };
}

/** 让所有 pending 微任务（fetchOnce 的 await + setQuote）跑完 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useRealtimeQuote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchRealtimeQuote).mockReset();
    vi.mocked(isTradingHours).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mount 即拉一次，即便闭市时段', async () => {
    vi.mocked(isTradingHours).mockReturnValue(false);
    vi.mocked(fetchRealtimeQuote).mockResolvedValue(buildQuote({ price: 100 }));

    const { result } = renderHook(() => useRealtimeQuote('AAPL'));
    await flush();

    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1);
    expect(result.current?.price).toBe(100);
  });

  it('开盘时段：每 POLL_MS 触发一次拉取', async () => {
    vi.mocked(isTradingHours).mockReturnValue(true);
    vi.mocked(fetchRealtimeQuote).mockResolvedValue(buildQuote());

    renderHook(() => useRealtimeQuote('AAPL'));
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(3);
  });

  it('闭市时段：tick 空转，不再发起额外请求', async () => {
    vi.mocked(isTradingHours).mockReturnValue(false);
    vi.mocked(fetchRealtimeQuote).mockResolvedValue(buildQuote());

    renderHook(() => useRealtimeQuote('AAPL'));
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 5);
    });
    await flush();
    // mount 即时那一次以外，timer 触发的 tick 应全部短路
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1);
  });

  it('跨越 close→open 边界：开盘后下一轮 tick 即恢复', async () => {
    vi.mocked(fetchRealtimeQuote).mockResolvedValue(buildQuote());
    vi.mocked(isTradingHours).mockReturnValue(false);

    renderHook(() => useRealtimeQuote('AAPL'));
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(1); // 仍闭市

    vi.mocked(isTradingHours).mockReturnValue(true); // 模拟开盘
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    expect(fetchRealtimeQuote).toHaveBeenCalledTimes(2);
  });

  it('symbol 切换：旧 fetch 解析晚到时不覆盖新 quote', async () => {
    vi.mocked(isTradingHours).mockReturnValue(false);

    let resolveSlow!: (q: RealtimeQuote) => void;
    const slowPromise = new Promise<RealtimeQuote>((r) => {
      resolveSlow = r;
    });

    vi.mocked(fetchRealtimeQuote)
      .mockImplementationOnce(() => slowPromise)
      .mockImplementationOnce(async () => buildQuote({ symbol: 'TSLA', price: 250 }));

    const { result, rerender } = renderHook(({ s }: { s: string }) => useRealtimeQuote(s), {
      initialProps: { s: 'AAPL' },
    });

    rerender({ s: 'TSLA' });
    await flush();
    expect(result.current?.symbol).toBe('TSLA');
    expect(result.current?.price).toBe(250);

    // 旧请求才完成 —— 应被 active 守卫丢弃
    await act(async () => {
      resolveSlow(buildQuote({ symbol: 'AAPL', price: 100 }));
    });
    await flush();
    expect(result.current?.symbol).toBe('TSLA');
    expect(result.current?.price).toBe(250);
  });

  it('fetch 抛错：静默吞掉，保留上一次的 quote', async () => {
    vi.mocked(isTradingHours).mockReturnValue(true);
    vi.mocked(fetchRealtimeQuote)
      .mockResolvedValueOnce(buildQuote({ price: 150 }))
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useRealtimeQuote('AAPL'));
    await flush();
    expect(result.current?.price).toBe(150);

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    // 第二次 reject —— quote 仍是上一次成功的 150
    expect(result.current?.price).toBe(150);
  });
});
