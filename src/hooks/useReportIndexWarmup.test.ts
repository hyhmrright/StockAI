import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReportIndexWarmup } from './useReportIndexWarmup';

describe('useReportIndexWarmup', () => {
  it('切到某 symbol 时预热一次', () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useReportIndexWarmup('600519', warmup));
    expect(warmup).toHaveBeenCalledTimes(1);
    expect(warmup).toHaveBeenCalledWith('600519');
  });

  it('同一 symbol 重复渲染不重复预热（索引已缓存，重复调用是纯浪费）', () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(() => useReportIndexWarmup('600519', warmup));
    rerender();
    rerender();
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  it('切换 symbol 时为新标的再预热一次', () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ s }) => useReportIndexWarmup(s, warmup), {
      initialProps: { s: '600519' },
    });
    rerender({ s: '000858' });
    expect(warmup).toHaveBeenCalledTimes(2);
    expect(warmup).toHaveBeenLastCalledWith('000858');
  });

  it('空 symbol 不预热', () => {
    const warmup = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useReportIndexWarmup('', warmup));
    expect(warmup).not.toHaveBeenCalled();
  });

  it('预热失败不抛给调用方（严格 fire-and-forget）', () => {
    const warmup = vi.fn().mockRejectedValue(new Error('boom'));
    expect(() => renderHook(() => useReportIndexWarmup('600519', warmup))).not.toThrow();
  });
});
