import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const store = vi.hoisted(() => ({
  registerQuotes: vi.fn(() => () => {}),
  getQuotesSnapshot: vi.fn(() => ({ quotes: {}, failed: [] })),
  subscribeQuotes: vi.fn(() => () => {}),
}));
vi.mock('../lib/quotes-store', () => store);

import { useQuotes } from './useQuotes';

/**
 * 轮询语义在 lib/quotes-store.test.ts 里测（那是它现在的归属）。
 * 这里只守 hook 自己那点职责：注册什么、什么时候重订阅、什么时候注销。
 */
beforeEach(() => {
  store.registerQuotes.mockReset().mockReturnValue(() => {});
  store.getQuotesSnapshot.mockReset().mockReturnValue({ quotes: {}, failed: [] });
  store.subscribeQuotes.mockReset().mockReturnValue(() => {});
});

describe('useQuotes', () => {
  it('空列表不注册', () => {
    renderHook(() => useQuotes([]));
    expect(store.registerQuotes).not.toHaveBeenCalled();
  });

  it('注册排序去重后的代码集合', () => {
    renderHook(() => useQuotes(['MSFT', 'AAPL', 'MSFT']));
    expect(store.registerQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT']);
  });

  it('入参数组每次渲染都是新引用，不该重复注册', () => {
    // 调用方在渲染里现算代码数组，引用每帧都变；直接进 deps 会让订阅每帧重建
    const { rerender } = renderHook(({ syms }) => useQuotes(syms), {
      initialProps: { syms: ['AAPL'] },
    });
    rerender({ syms: ['AAPL'] });
    rerender({ syms: ['AAPL'] });

    expect(store.registerQuotes).toHaveBeenCalledTimes(1);
  });

  it('代码集合真的变了才重订阅，并先注销旧的', () => {
    const off = vi.fn();
    store.registerQuotes.mockReturnValue(off);

    const { rerender } = renderHook(({ syms }) => useQuotes(syms), {
      initialProps: { syms: ['AAPL'] },
    });
    rerender({ syms: ['AAPL', 'MSFT'] });

    expect(off).toHaveBeenCalledTimes(1);
    expect(store.registerQuotes).toHaveBeenLastCalledWith(['AAPL', 'MSFT']);
  });

  it('卸载时注销订阅——否则关掉持仓弹窗后它的代码还留在并集里', () => {
    const off = vi.fn();
    store.registerQuotes.mockReturnValue(off);

    renderHook(() => useQuotes(['AAPL'])).unmount();

    expect(off).toHaveBeenCalledTimes(1);
  });

  it('返回 store 的快照', () => {
    const snapshot = { quotes: {}, failed: ['AAPL'] };
    store.getQuotesSnapshot.mockReturnValue(snapshot);

    const { result } = renderHook(() => useQuotes(['AAPL']));

    expect(result.current).toBe(snapshot);
  });
});
