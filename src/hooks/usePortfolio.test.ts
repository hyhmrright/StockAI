import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Position, RealtimeQuote } from '../../shared/types';

const db = vi.hoisted(() => ({
  getPositions: vi.fn(),
  upsertPosition: vi.fn(),
  updatePosition: vi.fn(),
  deletePosition: vi.fn(),
}));
vi.mock('../lib/positions-db', () => db);

const { useQuotes } = vi.hoisted(() => ({ useQuotes: vi.fn() }));
vi.mock('./useQuotes', () => ({ useQuotes }));

import { usePortfolio } from './usePortfolio';

const pos = (symbol: string, shares: number, costPrice: number, id = 1): Position => ({
  id,
  symbol,
  shares,
  costPrice,
  openedAt: 0,
});

function quote(symbol: string, price: number): RealtimeQuote {
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
    timestamp: 0,
    currency: 'USD',
    market: '美股',
  };
}

beforeEach(() => {
  db.getPositions.mockReset().mockResolvedValue([]);
  db.upsertPosition.mockReset().mockResolvedValue(null);
  db.deletePosition.mockReset().mockResolvedValue(undefined);
  useQuotes.mockReset().mockReturnValue({ quotes: {}, failed: [] });
});

describe('usePortfolio', () => {
  it('挂载时读取持仓并组合估值', async () => {
    db.getPositions.mockResolvedValue([pos('AAPL', 100, 150)]);
    useQuotes.mockReturnValue({ quotes: { AAPL: quote('AAPL', 180) }, failed: [] });

    const { result } = renderHook(() => usePortfolio());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.positions).toHaveLength(1);
    expect(result.current.overview.valuations[0].pnl).toBe(3_000);
  });

  it('写操作后整表重读，而不是凭入参在本地拼接', async () => {
    // 加仓要按加权平均合并成本，那笔计算发生在 db 层；本地猜结果迟早和库里对不上
    db.getPositions.mockResolvedValue([]);
    const { result } = renderHook(() => usePortfolio());
    await waitFor(() => expect(result.current.loading).toBe(false));

    db.getPositions.mockResolvedValue([pos('AAPL', 400, 17.5)]);
    await act(async () => {
      await result.current.add({ symbol: 'AAPL', shares: 300, costPrice: 20, openedAt: 0 });
    });

    expect(db.getPositions).toHaveBeenCalledTimes(2);
    expect(result.current.positions[0].costPrice).toBe(17.5);
  });

  it('读取失败时保留上一次的持仓列表，不清空', async () => {
    // 清空会让用户以为持仓丢了——比显示一份稍旧的数据糟糕得多
    db.getPositions.mockResolvedValue([pos('AAPL', 100, 150)]);
    const { result } = renderHook(() => usePortfolio());
    await waitFor(() => expect(result.current.positions).toHaveLength(1));

    db.getPositions.mockRejectedValue(new Error('数据库锁住了'));
    db.deletePosition.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.remove(1);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.positions).toHaveLength(1);
  });

  it('写失败时不重读，并记下错误', async () => {
    db.getPositions.mockResolvedValue([]);
    const { result } = renderHook(() => usePortfolio());
    await waitFor(() => expect(result.current.loading).toBe(false));

    db.upsertPosition.mockRejectedValue(new Error('写不进去'));
    await act(async () => {
      await result.current.add({ symbol: 'X', shares: 1, costPrice: 1, openedAt: 0 });
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(db.getPositions).toHaveBeenCalledTimes(1); // 只有挂载那次
  });

  it('只为持仓中的标的取价', async () => {
    db.getPositions.mockResolvedValue([pos('AAPL', 1, 1, 1), pos('MSFT', 1, 1, 2)]);
    const { result } = renderHook(() => usePortfolio());
    await waitFor(() => expect(result.current.positions).toHaveLength(2));

    expect(useQuotes).toHaveBeenLastCalledWith(['AAPL', 'MSFT']);
  });
});
