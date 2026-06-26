import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceAlerts } from './usePriceAlerts';

const mockGet = vi.fn().mockResolvedValue(null);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockSave = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/store', () => ({
  getStore: () => Promise.resolve({ get: mockGet, set: mockSet, save: mockSave }),
}));

beforeEach(() => {
  mockGet.mockClear();
  mockSet.mockClear();
  mockSave.mockClear();
});

describe('usePriceAlerts', () => {
  it('starts with empty alerts', () => {
    const { result } = renderHook(() => usePriceAlerts());
    expect(result.current.alerts).toEqual({});
  });

  it('setAlert adds a new alert', async () => {
    const { result } = renderHook(() => usePriceAlerts());
    act(() => result.current.setAlert('AAPL', 200, 150));
    expect(result.current.alerts.AAPL).toEqual({
      symbol: 'AAPL',
      upperLimit: 200,
      lowerLimit: 150,
      enabled: true,
    });
  });

  it('removeAlert removes an alert', async () => {
    const { result } = renderHook(() => usePriceAlerts());
    act(() => result.current.setAlert('AAPL', 200));
    expect(result.current.alerts.AAPL).toBeDefined();
    act(() => result.current.removeAlert('AAPL'));
    expect(result.current.alerts.AAPL).toBeUndefined();
  });

  it('toggleAlert flips enabled state', () => {
    const { result } = renderHook(() => usePriceAlerts());
    act(() => result.current.setAlert('TSLA', 300));
    expect(result.current.alerts.TSLA.enabled).toBe(true);
    act(() => result.current.toggleAlert('TSLA'));
    expect(result.current.alerts.TSLA.enabled).toBe(false);
    act(() => result.current.toggleAlert('TSLA'));
    expect(result.current.alerts.TSLA.enabled).toBe(true);
  });
});
