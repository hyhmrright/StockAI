import { describe, it, expect, vi, afterEach } from 'vitest';
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

/** 非 Tauri 环境下通知走 console.log('[alert-mock] ...')，据此计数 */
function alertLog() {
  return vi.spyOn(console, 'log').mockImplementation(() => {});
}
const alertCount = (spy: ReturnType<typeof alertLog>) =>
  spy.mock.calls.filter((c) => String(c[0]).includes('[alert-mock]')).length;

const quotesOf = (symbol: string, price: number) => ({ [symbol]: makeQuote(symbol, price) });

afterEach(() => vi.restoreAllMocks());

describe('useAlertMonitor', () => {
  it('突破上限时通知', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };
    renderHook(() => useAlertMonitor(alerts, quotesOf('AAPL', 205)));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('突破上限'));
  });

  it('跌破下限时通知', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      TSLA: { symbol: 'TSLA', lowerLimit: 150, enabled: true },
    };
    renderHook(() => useAlertMonitor(alerts, quotesOf('TSLA', 145)));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('跌破下限'));
  });

  it('已停用的告警不通知', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: false },
    };
    renderHook(() => useAlertMonitor(alerts, quotesOf('AAPL', 205)));
    expect(alertCount(spy)).toBe(0);
  });

  it('还没有报价的标的不通知——缺数据不等于越界', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', lowerLimit: 150, enabled: true },
    };
    renderHook(() => useAlertMonitor(alerts, {}));
    expect(alertCount(spy)).toBe(0);
  });

  it('持续越界只通知一次——边沿触发，不是每轮一弹', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };
    const { rerender } = renderHook(({ q }) => useAlertMonitor(alerts, q), {
      initialProps: { q: quotesOf('AAPL', 205) },
    });
    rerender({ q: quotesOf('AAPL', 210) });
    expect(alertCount(spy)).toBe(1);
  });

  it('价格回到区间内后重新武装，再次越界会再通知', () => {
    const spy = alertLog();
    const alerts: Record<string, PriceAlert> = {
      AAPL: { symbol: 'AAPL', upperLimit: 200, enabled: true },
    };
    const { rerender } = renderHook(({ q }) => useAlertMonitor(alerts, q), {
      initialProps: { q: quotesOf('AAPL', 205) },
    });
    rerender({ q: quotesOf('AAPL', 195) });
    rerender({ q: quotesOf('AAPL', 210) });
    expect(alertCount(spy)).toBe(2);
  });
});
