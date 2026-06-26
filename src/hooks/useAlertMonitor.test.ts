import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAlertMonitor } from './useAlertMonitor';
import type { PriceAlert } from './usePriceAlerts';
import type { RealtimeQuote } from '../../shared/types';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

function makeQuote(symbol: string, price: number): RealtimeQuote {
  return {
    symbol,
    name: symbol,
    price,
    change: 0,
    changePercent: 0,
    open: price,
    high: price,
    low: price,
    prevClose: price,
    volume: 0,
    amount: 0,
    timestamp: Date.now() / 1000,
    currency: 'USD',
    market: '美股',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAlertMonitor', () => {
  it('fires notification when price crosses upper limit', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(makeQuote('AAPL', 205));

    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };

    renderHook(() => useAlertMonitor(alerts, fetcher));

    await vi.advanceTimersByTimeAsync(100);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('突破上限'));
    consoleSpy.mockRestore();
  });

  it('fires notification when price crosses lower limit', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(makeQuote('TSLA', 145));

    const alerts: Record<string, PriceAlert> = {
      TSLA: { symbol: 'TSLA', lowerLimit: 150, enabled: true },
    };

    renderHook(() => useAlertMonitor(alerts, fetcher));

    await vi.advanceTimersByTimeAsync(100);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('跌破下限'));
    consoleSpy.mockRestore();
  });

  it('does not fire for disabled alerts', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(makeQuote('AAPL', 205));

    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: false },
    };

    renderHook(() => useAlertMonitor(alerts, fetcher));

    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not fire duplicate notifications', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValue(makeQuote('AAPL', 205));

    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };

    renderHook(() => useAlertMonitor(alerts, fetcher));

    await vi.advanceTimersByTimeAsync(100);
    const countAfterFirst = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes('alert-mock'),
    ).length;

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(100);
    const countAfterSecond = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes('alert-mock'),
    ).length;

    expect(countAfterSecond).toBe(countAfterFirst);
    consoleSpy.mockRestore();
  });

  it('re-arms after price returns within bounds', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeQuote('AAPL', 205))
      .mockResolvedValueOnce(makeQuote('AAPL', 195))
      .mockResolvedValueOnce(makeQuote('AAPL', 210));

    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };

    renderHook(() => useAlertMonitor(alerts, fetcher));

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(100);

    const alertCalls = consoleSpy.mock.calls.filter((c) => String(c[0]).includes('alert-mock'));
    expect(alertCalls.length).toBe(2);
    consoleSpy.mockRestore();
  });
});
