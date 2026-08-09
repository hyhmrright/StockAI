import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalRouter } from './useModalRouter';

describe('useModalRouter', () => {
  it('初始没有任何浮层打开', () => {
    const { result } = renderHook(() => useModalRouter());
    expect(result.current.active).toBeNull();
  });

  it('open 切换到指定浮层，close 回到 null', () => {
    const { result } = renderHook(() => useModalRouter());

    act(() => result.current.open('portfolio'));
    expect(result.current.active).toBe('portfolio');

    act(() => result.current.close());
    expect(result.current.active).toBeNull();
  });

  /**
   * 这是收敛为单一 active 的**全部理由**：四个 boolean 时，「引导里点去设置」
   * 这类「开 B 前忘了关 A」的路径会叠出两层遮罩，而类型系统拦不住。
   */
  it('打开新浮层会顶掉旧的，不会两个同时开', () => {
    const { result } = renderHook(() => useModalRouter());

    act(() => result.current.open('overview'));
    act(() => result.current.open('settings'));

    expect(result.current.active).toBe('settings');
  });

  it('close 的引用稳定，不会让下游 memo 每次渲染都失效', () => {
    const { result, rerender } = renderHook(() => useModalRouter());
    const first = result.current.close;
    rerender();
    expect(result.current.close).toBe(first);
  });
});
