import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAsyncOnce } from './useAsyncOnce';

describe('useAsyncOnce', () => {
  it('挂载后取到数据', async () => {
    const { result } = renderHook(() => useAsyncOnce(async () => 42));
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.error).toBeNull();
  });

  it('失败时暴露 error 而非把它吞成空数据', async () => {
    const boom = new Error('boom');
    const { result } = renderHook(() => useAsyncOnce(() => Promise.reject(boom)));
    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.data).toBeNull();
  });

  /**
   * 这条是这个 hook 存在的全部理由：调用方几乎一定传内联箭头，
   * 每次渲染都是新引用。把 fetcher 放进依赖数组会变成无限重取。
   */
  it('重渲染不重复取数——即便每次传的是新的 fetcher 引用', async () => {
    const spy = vi.fn(async () => 1);
    const { result, rerender } = renderHook(() => useAsyncOnce(() => spy()));

    await waitFor(() => expect(result.current.data).toBe(1));
    rerender();
    rerender();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // 刻意不测 cancelled 守卫：React 18 起卸载后 setState 是静默 no-op，
  // 去掉守卫任何断言都照样绿（已实测）。理由见 useAsyncOnce.ts 的注释。
});
