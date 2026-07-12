import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useMasterWeights } from './useMasterWeights';
import type { MasterSignalRecord } from '../../shared/types';

// 测试构造助手：默认值齐全，按需覆写
function sig(over: Partial<MasterSignalRecord>): MasterSignalRecord {
  return {
    id: 1,
    masterId: 'warren-buffett',
    symbol: 'AAPL',
    signal: 'bullish',
    confidence: 80,
    priceAt: 100,
    recordedAt: 1_000,
    ...over,
  };
}

describe('useMasterWeights', () => {
  it('空历史 → 空数组（best-effort 退化默认权重）', async () => {
    const loadSignals = vi.fn(async () => []);
    const loadPrice = vi.fn(async () => 100);
    const { result } = renderHook(() => useMasterWeights(loadSignals, loadPrice));

    await waitFor(() => expect(loadSignals).toHaveBeenCalled());
    expect(result.current.weights).toEqual([]);
    // 空历史无需回查任何现价
    expect(loadPrice).not.toHaveBeenCalled();
  });

  it('有战绩 → 派生权重快照（过滤掉全待定的大师）', async () => {
    const loadSignals = vi.fn(async () => [
      sig({ id: 1, masterId: 'a', signal: 'bullish', priceAt: 100 }), // 命中
      sig({ id: 2, masterId: 'b', signal: 'neutral', priceAt: 100 }), // 全待定 → 过滤
    ]);
    const loadPrice = vi.fn(async () => 110);
    const { result } = renderHook(() => useMasterWeights(loadSignals, loadPrice));

    await waitFor(() => expect(result.current.weights.length).toBe(1));
    expect(result.current.weights[0]).toEqual({ masterId: 'a', sampleSize: 1, hits: 1 });
  });

  it('取数失败 → 静默降级为空数组，不抛错阻塞', async () => {
    const loadSignals = vi.fn(async () => {
      throw new Error('db 读取失败');
    });
    const loadPrice = vi.fn(async () => 100);
    const { result } = renderHook(() => useMasterWeights(loadSignals, loadPrice));

    await waitFor(() => expect(loadSignals).toHaveBeenCalled());
    expect(result.current.weights).toEqual([]);
  });

  it('refetch 重新拉取权重快照', async () => {
    const loadSignals = vi.fn(async () => [sig({ masterId: 'a', priceAt: 100 })]);
    const loadPrice = vi.fn(async () => 110);
    const { result } = renderHook(() => useMasterWeights(loadSignals, loadPrice));

    await waitFor(() => expect(result.current.weights.length).toBe(1));
    result.current.refetch();
    await waitFor(() => expect(loadSignals).toHaveBeenCalledTimes(2));
  });
});
