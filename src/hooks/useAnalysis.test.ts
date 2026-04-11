import { renderHook, act } from '@testing-library/react';
import { useAnalysis } from './useAnalysis';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { vi, describe, it, expect } from 'vitest';
import { FullAnalysisResponse } from '../../shared/types';

/**
 * 模拟 IPC 调用
 */
vi.mock('../lib/ipc', () => ({
  startAnalysis: vi.fn(),
}));

/**
 * 模拟分析响应工厂函数
 */
function createMockAnalysisResponse(overrides: Partial<FullAnalysisResponse> = {}): FullAnalysisResponse {
  return {
    symbol: 'AAPL',
    news: [
      { title: '测试新闻', source: 'Test', date: '2025-01-01', content: '内容', url: 'http://test.com' }
    ],
    analysis: {
      rating: 80,
      sentiment: 'bullish',
      summary: '看涨总结',
      pros: ['利多'],
      cons: ['利空']
    },
    ...overrides
  };
}

describe('useAnalysis Hook', () => {
  it('performAnalysis_ValidSymbol_TransitionsToCompleted', async () => {
    const symbol = 'TSLA';
    (startAnalysisIpc as any).mockResolvedValue(createMockAnalysisResponse({ symbol }));

    const { result } = renderHook(() => useAnalysis());
    
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
    (startAnalysisIpc as any).mockRejectedValue(new Error(errorMsg));

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain(expectedSubStr);
  });
});
