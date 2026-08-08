import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { BatchQuoteResult, RealtimeQuote } from '../../shared/types';

const { fetchRealtimeQuotes, isTradingHours } = vi.hoisted(() => ({
  fetchRealtimeQuotes: vi.fn(),
  isTradingHours: vi.fn(),
}));
vi.mock('../lib/ipc', () => ({ fetchRealtimeQuotes }));
vi.mock('../lib/market-hours', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/market-hours')>()),
  isTradingHours,
}));

import { useQuotes } from './useQuotes';

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

/** 把若干 symbol→price 组装成一次成功的批量响应 */
const ok = (pairs: Record<string, number>): BatchQuoteResult => ({
  quotes: Object.fromEntries(Object.entries(pairs).map(([s, p]) => [s, quote(s, p)])),
  failed: [],
});

/** 推进一个轮询周期并放行随后落地的 promise */
async function pollOnce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
}

/** 放行首次立即取价 */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  fetchRealtimeQuotes.mockReset();
  isTradingHours.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('useQuotes', () => {
  it('空列表不取数', async () => {
    renderHook(() => useQuotes([]));
    await settle();
    expect(fetchRealtimeQuotes).not.toHaveBeenCalled();
  });

  it('首次立即取全部，即使全都休市——要给出"最后已知价格"', async () => {
    isTradingHours.mockReturnValue(false);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200, '600519': 1680 }));

    const { result } = renderHook(() => useQuotes(['AAPL', '600519']));
    await settle();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(result.current.quotes.AAPL.price).toBe(200);
  });

  it('轮询只拉处于交易时段的标的', async () => {
    // 回归保护：原先的告警轮询无视交易时段通宵取价，A 股夜里每 10s 打一次全是浪费
    isTradingHours.mockImplementation((market: string) => market === 'A股');
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200, '600519': 1680 }));

    renderHook(() => useQuotes(['AAPL', '600519']));
    await settle();
    await pollOnce();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(2);
    expect(fetchRealtimeQuotes.mock.calls[0][0]).toEqual(['600519', 'AAPL']); // 首轮全量
    expect(fetchRealtimeQuotes.mock.calls[1][0]).toEqual(['600519']); // 只剩开盘的 A 股
  });

  it('全都休市时轮询根本不发请求', async () => {
    isTradingHours.mockReturnValue(false);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200 }));

    renderHook(() => useQuotes(['AAPL']));
    await settle();
    await pollOnce();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(1);
  });

  it('部分刷新时保留上一轮的价，不把休市那半边清空', async () => {
    isTradingHours.mockImplementation((market: string) => market === 'A股');
    fetchRealtimeQuotes
      .mockResolvedValueOnce(ok({ AAPL: 200, '600519': 1680 }))
      .mockResolvedValueOnce(ok({ '600519': 1700 }));

    const { result } = renderHook(() => useQuotes(['AAPL', '600519']));
    await settle();
    await pollOnce();

    expect(result.current.quotes['600519'].price).toBe(1700);
    expect(result.current.quotes.AAPL.price).toBe(200); // 美股休市，保留旧价
  });

  it('整批抛出时该批全部记为失败，而不是静静保留旧价', async () => {
    isTradingHours.mockReturnValue(false);
    fetchRealtimeQuotes.mockRejectedValue(new Error('数据源全挂'));

    const { result } = renderHook(() => useQuotes(['AAPL']));
    await settle();

    expect(result.current.failed).toEqual(['AAPL']);
  });

  it('失败标记在下一次成功后清掉，不会永久粘住', async () => {
    isTradingHours.mockReturnValue(true);
    fetchRealtimeQuotes
      .mockResolvedValueOnce({ quotes: {}, failed: ['AAPL'] })
      .mockResolvedValueOnce(ok({ AAPL: 200 }));

    const { result } = renderHook(() => useQuotes(['AAPL']));
    await settle();
    expect(result.current.failed).toEqual(['AAPL']);

    await pollOnce();
    expect(result.current.failed).toEqual([]);
  });

  it('入参数组每次渲染都是新引用，不该重启轮询', async () => {
    // 关注列表在渲染里现算 symbol 数组，引用每帧都变；直接进 deps 会让 effect 每帧重建
    isTradingHours.mockReturnValue(false);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200 }));

    const { rerender } = renderHook(({ syms }) => useQuotes(syms), {
      initialProps: { syms: ['AAPL'] },
    });
    await settle();
    rerender({ syms: ['AAPL'] });
    rerender({ syms: ['AAPL'] });
    await settle();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(1);
  });
});
