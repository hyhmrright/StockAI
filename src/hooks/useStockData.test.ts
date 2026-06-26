import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketBundle } from '../../shared/types';
import { useStockData } from './useStockData';

function buildBundle(symbol: string, newsCount = 2): MarketBundle {
  return {
    symbol,
    stockInfo: {
      name: symbol,
      code: symbol,
      exchange: 'NASDAQ',
      market: '美股',
      price: 100,
      currency: 'USD',
    },
    news: Array.from({ length: newsCount }, (_, i) => ({
      title: `news-${i}`,
      source: 'test',
      date: '2026-05-23',
      content: '',
      url: `https://example.com/${i}`,
    })),
  };
}

describe('useStockData', () => {
  it('挂载即拉取并切到 ready', async () => {
    const fetcher = vi.fn(async (sym: string) => buildBundle(sym));
    const { result } = renderHook(() => useStockData('AAPL', fetcher));

    expect(result.current.step).toBe('fetching');
    await waitFor(() => expect(result.current.step).toBe('ready'));
    expect(fetcher).toHaveBeenCalledWith('AAPL');
    expect(result.current.news).toHaveLength(2);
    expect(result.current.stockInfo?.code).toBe('AAPL');
  });

  it('symbol 变化触发重新抓取', async () => {
    const fetcher = vi.fn(async (sym: string) => buildBundle(sym, 1));
    const { result, rerender } = renderHook(({ s }) => useStockData(s, fetcher), {
      initialProps: { s: 'AAPL' },
    });

    await waitFor(() => expect(result.current.step).toBe('ready'));
    rerender({ s: 'MSFT' });
    await waitFor(() => expect(result.current.stockInfo?.code).toBe('MSFT'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('抓取失败时 step=error 且 news 清空', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('scrape boom');
    });
    const { result } = renderHook(() => useStockData('XYZ', fetcher));

    await waitFor(() => expect(result.current.step).toBe('error'));
    expect(result.current.error).toMatch(/scrape boom/);
    expect(result.current.news).toHaveLength(0);
    expect(result.current.stockInfo).toBeUndefined();
  });

  it('refetch 触发重新拉取（即使 symbol 不变）', async () => {
    const fetcher = vi.fn(async (sym: string) => buildBundle(sym));
    const { result } = renderHook(() => useStockData('AAPL', fetcher));

    await waitFor(() => expect(result.current.step).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('旧请求若晚于新请求返回不应覆盖新数据（防竞态）', async () => {
    let resolveOld: ((b: MarketBundle) => void) | null = null;
    const fetcher = vi.fn((sym: string) => {
      if (sym === 'AAPL')
        return new Promise<MarketBundle>((res) => {
          resolveOld = res;
        });
      return Promise.resolve(buildBundle(sym));
    });

    const { result, rerender } = renderHook(({ s }) => useStockData(s, fetcher), {
      initialProps: { s: 'AAPL' },
    });

    rerender({ s: 'MSFT' });
    await waitFor(() => expect(result.current.stockInfo?.code).toBe('MSFT'));

    // 现在迟到的 AAPL 响应回来——不应覆盖 MSFT
    await act(async () => {
      resolveOld!(buildBundle('AAPL'));
      await Promise.resolve();
    });
    expect(result.current.stockInfo?.code).toBe('MSFT');
  });
});
