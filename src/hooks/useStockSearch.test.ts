import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { StockSearchResult } from '../../shared/types';

const { searchStocks } = vi.hoisted(() => ({ searchStocks: vi.fn() }));
vi.mock('../lib/ipc', () => ({ searchStocks }));

import { useStockSearch } from './useStockSearch';

const hit = (code: string): StockSearchResult => ({
  code,
  name: code,
  type: 'A股',
  fullCode: `sh${code}`,
});

/** 推进防抖窗口并放行随后落地的 promise */
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('useStockSearch', () => {
  beforeEach(() => {
    searchStocks.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('少于 2 个字符不发请求', async () => {
    renderHook(() => useStockSearch('a'));
    await tick();
    expect(searchStocks).not.toHaveBeenCalled();
  });

  it('搜索失败时清空上一次的结果', async () => {
    // 回归保护：原先失败只 console.error，results 保持不变——
    // 下拉里挂着上一个关键词的命中，用户看着像"搜到了"，点进去是另一只股票。
    searchStocks.mockResolvedValueOnce([hit('600519')]);
    const { result, rerender } = renderHook(({ kw }) => useStockSearch(kw), {
      initialProps: { kw: '茅台' },
    });
    await tick();
    expect(result.current.results).toHaveLength(1);

    searchStocks.mockRejectedValueOnce(new Error('数据源全挂'));
    rerender({ kw: '茅台酒' });
    await tick();

    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('请求在途时把关键词删短，spinner 会复位', async () => {
    // 竞态守卫让在途请求的 finally 不再复位 isSearching，这条路径得由短关键词分支自己收尾，
    // 否则 spinner 永远转下去。
    searchStocks.mockImplementationOnce(() => new Promise<StockSearchResult[]>(() => {}));
    const { result, rerender } = renderHook(({ kw }) => useStockSearch(kw), {
      initialProps: { kw: '茅台' },
    });
    await tick();
    expect(result.current.isSearching).toBe(true);

    rerender({ kw: '茅' });
    await tick();

    expect(result.current.isSearching).toBe(false);
  });

  it('在途的旧请求不会覆盖新关键词的结果', async () => {
    // 回归保护：防抖只挡得住还没发出的请求。旧请求慢于新请求返回时，
    // 没有 cancelled 守卫就会把旧关键词的结果盖上去。
    let landOld: (v: StockSearchResult[]) => void = () => {};
    searchStocks
      .mockImplementationOnce(() => new Promise<StockSearchResult[]>((r) => (landOld = r)))
      .mockResolvedValueOnce([hit('NEW')]);

    const { result, rerender } = renderHook(({ kw }) => useStockSearch(kw), {
      initialProps: { kw: '旧词' },
    });
    await tick(); // 旧请求已发出，悬而未决

    rerender({ kw: '新词' });
    await tick(); // 新请求发出并落地
    expect(result.current.results[0].code).toBe('NEW');

    await act(async () => landOld([hit('OLD')]));
    expect(result.current.results[0].code).toBe('NEW');
  });
});
