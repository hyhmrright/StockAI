import { renderHook, act } from '@testing-library/react';
import { useAnalysis } from './useAnalysis';
import { vi, describe, it, expect } from 'vitest';
import { createMockAnalysisResponse } from '../../shared/test-utils';
import { AnalysisService } from '../lib/api';

describe('useAnalysis Hook', () => {
  const mockService: AnalysisService = {
    startAnalysis: vi.fn(),
    getStockInfo: vi.fn().mockResolvedValue(null),
  };

  it('performAnalysis_ValidSymbol_TransitionsToCompleted', async () => {
    const symbol = 'TSLA';
    vi.mocked(mockService.startAnalysis).mockResolvedValue(createMockAnalysisResponse({ symbol }));

    const { result } = renderHook(() => useAnalysis(mockService));
    
    await act(async () => {
      await result.current.performAnalysis(symbol);
    });

    expect(result.current.step).toBe('completed');
    expect(result.current.result?.symbol).toBe(symbol);
  });

  it.each([
    ['FormatError', '分析结果格式异常', '分析结果格式异常'],
    ['NoResponse', '分析服务无响应', '分析服务无响应'],
    ['EmptyNews', '未搜寻到相关新闻', '未搜寻到相关新闻'],
    ['NetworkError', '网络错误', '网络错误'],
  ])('performAnalysis_IPCThrows%s_TransitionsToErrorWithExpectedMessage', async (_, errorMsg, expectedSubStr) => {
    vi.mocked(mockService.startAnalysis).mockRejectedValue(new Error(errorMsg));

    const { result } = renderHook(() => useAnalysis(mockService));

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain(expectedSubStr);
  });

  it('performAnalysis_ConcurrentCalls_OnlyLatestResultWins', async () => {
    // 模拟第一个请求较慢，第二个请求较快
    let resolveFirst: (val: any) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
    
    vi.mocked(mockService.startAnalysis).mockImplementation((symbol) => {
      if (symbol === 'FIRST') return firstPromise;
      return Promise.resolve(createMockAnalysisResponse({ symbol: 'SECOND' }));
    });

    const { result } = renderHook(() => useAnalysis(mockService));
    
    let p1: Promise<void>;
    await act(async () => {
      p1 = result.current.performAnalysis('FIRST');
      // 立即触发第二个请求
      await result.current.performAnalysis('SECOND');
    });

    // 此时第二个请求已完成
    expect(result.current.result?.symbol).toBe('SECOND');
    expect(result.current.step).toBe('completed');

    // 现在完成第一个请求
    await act(async () => {
      resolveFirst!(createMockAnalysisResponse({ symbol: 'FIRST' }));
      await p1!;
    });

    // 结果应该仍然是第二个请求的（'SECOND'），而不是被第一个请求覆盖
    expect(result.current.result?.symbol).toBe('SECOND');
  });
});
