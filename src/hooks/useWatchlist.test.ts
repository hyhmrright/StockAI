import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWatchlist, DEFAULT_WATCHLIST } from './useWatchlist';

// 模拟 store：内存中的 key-value 存储
function createMockStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: vi.fn(async <T>(key: string) => data.get(key) as T | undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
    save: vi.fn(async () => {}),
    _data: data,
  };
}

let mockStore: ReturnType<typeof createMockStore>;

vi.mock('../lib/store', () => ({
  getStore: vi.fn(() => Promise.resolve(mockStore)),
}));

describe('useWatchlist', () => {
  beforeEach(() => {
    mockStore = createMockStore();
  });

  it('初始状态为默认关注列表', () => {
    const { result } = renderHook(() => useWatchlist());
    expect(result.current.items).toEqual(DEFAULT_WATCHLIST);
  });

  it('add 添加新 symbol 到列表末尾', async () => {
    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      result.current.add('GOOG');
    });

    expect(result.current.items).toHaveLength(DEFAULT_WATCHLIST.length + 1);
    expect(result.current.items[result.current.items.length - 1].sym).toBe('GOOG');
  });

  it('add 自动转换为大写并去空白', async () => {
    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      result.current.add('  goog  ');
    });

    const last = result.current.items[result.current.items.length - 1];
    expect(last.sym).toBe('GOOG');
  });

  it('add 重复 symbol 时不添加', async () => {
    const { result } = renderHook(() => useWatchlist());
    const originalLength = result.current.items.length;

    // AAPL 已在默认列表中
    await act(async () => {
      result.current.add('AAPL');
    });

    expect(result.current.items).toHaveLength(originalLength);
  });

  it('add 空字符串时不添加', async () => {
    const { result } = renderHook(() => useWatchlist());
    const originalLength = result.current.items.length;

    await act(async () => {
      result.current.add('   ');
    });

    expect(result.current.items).toHaveLength(originalLength);
  });

  it('remove 移除指定 symbol', async () => {
    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      result.current.remove('AAPL');
    });

    expect(result.current.items.find((i) => i.sym === 'AAPL')).toBeUndefined();
    expect(result.current.items).toHaveLength(DEFAULT_WATCHLIST.length - 1);
  });

  it('remove 不存在的 symbol 时列表不变', async () => {
    const { result } = renderHook(() => useWatchlist());
    const originalLength = result.current.items.length;

    await act(async () => {
      result.current.remove('NONEXIST');
    });

    expect(result.current.items).toHaveLength(originalLength);
  });

  it('add 后持久化到 store', async () => {
    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      result.current.add('AMZN');
    });

    expect(mockStore.set).toHaveBeenCalledWith(
      'watchlist',
      expect.arrayContaining([expect.objectContaining({ sym: 'AMZN' })]),
    );
    expect(mockStore.save).toHaveBeenCalled();
  });

  it('remove 后持久化到 store', async () => {
    const { result } = renderHook(() => useWatchlist());

    await act(async () => {
      result.current.remove('TSLA');
    });

    // 持久化的列表不应包含 TSLA
    const savedItems = mockStore.set.mock.calls[0][1] as Array<{ sym: string }>;
    expect(savedItems.find((i) => i.sym === 'TSLA')).toBeUndefined();
    expect(mockStore.save).toHaveBeenCalled();
  });

  it('store 有已保存数据时加载替代默认列表', async () => {
    const saved = [{ sym: 'BABA', name: '阿里巴巴' }];
    mockStore = createMockStore({ watchlist: saved });

    const { result } = renderHook(() => useWatchlist());

    // useEffect 异步加载，等 store.get 被调用
    await vi.waitFor(() => {
      expect(result.current.items).toEqual(saved);
    });
  });

  it('store 保存的空数组不覆盖默认列表', async () => {
    mockStore = createMockStore({ watchlist: [] });

    const { result } = renderHook(() => useWatchlist());

    // 空数组视为无有效数据，保留默认列表
    await vi.waitFor(() => {
      expect(mockStore.get).toHaveBeenCalled();
    });
    expect(result.current.items).toEqual(DEFAULT_WATCHLIST);
  });
});
