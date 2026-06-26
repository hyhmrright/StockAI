import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnalysisHistory } from './useAnalysisHistory';
import type { AnalysisRecordSummary } from '../../shared/types';

const mockGetHistory = vi.fn();
const mockDeleteRecords = vi.fn();

vi.mock('../lib/db', () => ({
  getAnalysisHistory: (...args: unknown[]) => mockGetHistory(...args),
  deleteAnalysisRecords: (...args: unknown[]) => mockDeleteRecords(...args),
}));

function makeRecords(count: number): AnalysisRecordSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    symbol: 'AAPL',
    analyzedAt: Date.now() - i * 3600_000,
    type: 'ai' as const,
    resultJson: '{"rating":75,"sentiment":"bullish"}',
    stockInfoJson: null,
  }));
}

beforeEach(() => {
  mockGetHistory.mockClear();
  mockDeleteRecords.mockClear();
  mockGetHistory.mockResolvedValue(makeRecords(2));
  mockDeleteRecords.mockResolvedValue(2);
});

describe('useAnalysisHistory', () => {
  it('loads records on mount', async () => {
    const { result } = renderHook(() => useAnalysisHistory('AAPL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records).toHaveLength(2);
    expect(mockGetHistory).toHaveBeenCalledWith({
      symbol: 'AAPL',
      analysisType: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it('filters by analysis type', async () => {
    const { result } = renderHook(() => useAnalysisHistory('AAPL', 'ai'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHistory).toHaveBeenCalledWith(expect.objectContaining({ analysisType: 'ai' }));
  });

  it('reloads when symbol changes', async () => {
    const { result, rerender } = renderHook(({ sym }) => useAnalysisHistory(sym), {
      initialProps: { sym: 'AAPL' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    rerender({ sym: 'TSLA' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
    expect(mockGetHistory).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: 'TSLA' }));
  });

  it('loads more records with offset', async () => {
    mockGetHistory.mockResolvedValueOnce(makeRecords(20));
    const { result } = renderHook(() => useAnalysisHistory('AAPL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    mockGetHistory.mockResolvedValueOnce([]);
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetHistory).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 }));
  });

  it('removes records by id', async () => {
    const { result } = renderHook(() => useAnalysisHistory('AAPL'));
    await waitFor(() => expect(result.current.records).toHaveLength(2));

    await act(async () => result.current.remove([1]));
    expect(mockDeleteRecords).toHaveBeenCalledWith([1]);
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].id).toBe(2);
  });

  it('sets hasMore to false when fewer than PAGE_SIZE returned', async () => {
    const { result } = renderHook(() => useAnalysisHistory('AAPL'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(false);
  });
});
