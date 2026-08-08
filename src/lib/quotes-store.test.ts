import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BatchQuoteResult, RealtimeQuote } from '../../shared/types';

const { fetchRealtimeQuotes, isTradingHours } = vi.hoisted(() => ({
  fetchRealtimeQuotes: vi.fn(),
  isTradingHours: vi.fn(),
}));
vi.mock('./ipc', () => ({ fetchRealtimeQuotes }));
vi.mock('./market-hours', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./market-hours')>()),
  isTradingHours,
}));

import {
  registerQuotes,
  getQuotesSnapshot,
  subscribeQuotes,
  _resetQuotesStore,
} from './quotes-store';

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

const ok = (pairs: Record<string, number>): BatchQuoteResult => ({
  quotes: Object.fromEntries(Object.entries(pairs).map(([s, p]) => [s, quote(s, p)])),
  failed: [],
});

/** 放行已排队的 promise（注册时的立即取数） */
const settle = () => vi.advanceTimersByTimeAsync(0);
/** 推进一个轮询周期 */
const pollOnce = () => vi.advanceTimersByTimeAsync(10_000);

beforeEach(() => {
  _resetQuotesStore();
  fetchRealtimeQuotes.mockReset().mockResolvedValue(ok({}));
  isTradingHours.mockReset().mockReturnValue(false);
  vi.useFakeTimers();
});
afterEach(() => {
  _resetQuotesStore();
  vi.useRealTimers();
});

describe('quotes-store', () => {
  it('注册时立即取一次，即使休市——要给出"最后已知价格"', async () => {
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200 }));
    registerQuotes(['AAPL']);
    await settle();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(getQuotesSnapshot().quotes.AAPL.price).toBe(200);
  });

  it('多个订阅方共用一个定时器，每轮只发一次请求（取并集）', async () => {
    // 这条是本次收敛的全部意义：三个消费方各自轮询 = 交易时段每 10 秒起 3 个 sidecar 进程
    isTradingHours.mockReturnValue(true);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 1, MSFT: 1, '600519': 1 }));

    registerQuotes(['AAPL']);
    registerQuotes(['MSFT']);
    registerQuotes(['600519', 'AAPL']); // 与第一个订阅方重叠
    await settle();
    fetchRealtimeQuotes.mockClear();

    await pollOnce();

    expect(fetchRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(fetchRealtimeQuotes.mock.calls[0][0]).toEqual(['600519', 'AAPL', 'MSFT']);
  });

  it('注册已有报价的代码不重复取数', async () => {
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200 }));
    registerQuotes(['AAPL']);
    await settle();
    fetchRealtimeQuotes.mockClear();

    registerQuotes(['AAPL']);
    await settle();

    expect(fetchRealtimeQuotes).not.toHaveBeenCalled();
  });

  it('轮询只拉处于交易时段的代码', async () => {
    isTradingHours.mockImplementation((market: string) => market === 'A股');
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 1, '600519': 1 }));

    registerQuotes(['AAPL', '600519']);
    await settle();
    fetchRealtimeQuotes.mockClear();

    await pollOnce();

    expect(fetchRealtimeQuotes.mock.calls[0][0]).toEqual(['600519']);
  });

  it('全都休市时轮询不发请求', async () => {
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 1 }));
    registerQuotes(['AAPL']);
    await settle();
    fetchRealtimeQuotes.mockClear();

    await pollOnce();

    expect(fetchRealtimeQuotes).not.toHaveBeenCalled();
  });

  it('部分刷新时保留上一轮的价，不把休市那半边清空', async () => {
    isTradingHours.mockImplementation((market: string) => market === 'A股');
    fetchRealtimeQuotes
      .mockResolvedValueOnce(ok({ AAPL: 200, '600519': 1680 }))
      .mockResolvedValueOnce(ok({ '600519': 1700 }));

    registerQuotes(['AAPL', '600519']);
    await settle();
    await pollOnce();

    expect(getQuotesSnapshot().quotes['600519'].price).toBe(1700);
    expect(getQuotesSnapshot().quotes.AAPL.price).toBe(200);
  });

  it('整批抛出时该批全部记为失败', async () => {
    fetchRealtimeQuotes.mockRejectedValue(new Error('数据源全挂'));
    registerQuotes(['AAPL']);
    await settle();

    expect(getQuotesSnapshot().failed).toEqual(['AAPL']);
  });

  it('失败标记在下一次成功后清掉，不会永久粘住', async () => {
    isTradingHours.mockReturnValue(true);
    fetchRealtimeQuotes
      .mockResolvedValueOnce({ quotes: {}, failed: ['AAPL'] })
      .mockResolvedValueOnce(ok({ AAPL: 200 }));

    registerQuotes(['AAPL']);
    await settle();
    expect(getQuotesSnapshot().failed).toEqual(['AAPL']);

    await pollOnce();
    expect(getQuotesSnapshot().failed).toEqual([]);
  });

  it('最后一个订阅方注销后停掉定时器', async () => {
    isTradingHours.mockReturnValue(true);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 1 }));

    const off = registerQuotes(['AAPL']);
    await settle();
    off();
    fetchRealtimeQuotes.mockClear();

    await pollOnce();

    expect(fetchRealtimeQuotes).not.toHaveBeenCalled();
  });

  it('报价更新时通知订阅者', async () => {
    const listener = vi.fn();
    subscribeQuotes(listener);
    fetchRealtimeQuotes.mockResolvedValue(ok({ AAPL: 200 }));

    registerQuotes(['AAPL']);
    await settle();

    expect(listener).toHaveBeenCalled();
  });
});
