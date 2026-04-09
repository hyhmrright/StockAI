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
  it('应该能正常处理分析流程的状态流转并传递正确的参数', async () => {
    const symbol = 'TSLA';
    const mockResult = JSON.stringify(createMockAnalysisResponse({ symbol }));

    (startAnalysisIpc as any).mockResolvedValue(mockResult);

    const { result } = renderHook(() => useAnalysis());

    expect(result.current.step).toBe('idle');

    await act(async () => {
      await result.current.performAnalysis(symbol);
    });

    // 关键修复：验证 IPC 是否接收到了正确的参数
    expect(startAnalysisIpc).toHaveBeenCalledWith(symbol);
    
    expect(result.current.step).toBe('completed');
    expect(result.current.result?.symbol).toBe(symbol);
    expect(result.current.error).toBeNull();
  });

  it('JSON 缺少 analysis 字段时应该报验证错误', async () => {
    const symbol = 'AAPL';
    // 强制类型转换为 any 以模拟非法数据
    const invalidResult = JSON.stringify({
      symbol,
      news: [],
    });

    (startAnalysisIpc as any).mockResolvedValue(invalidResult);

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis(symbol);
    });

    // 验证即使是错误路径，参数也应正确传递
    expect(startAnalysisIpc).toHaveBeenCalledWith(symbol);
    
    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain('格式异常');
  });

  it('Sidecar 返回空响应时应该报错', async () => {
    (startAnalysisIpc as any).mockResolvedValue('');

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain('无响应');
  });

  it('Sidecar 返回 error JSON 时应该展示错误信息', async () => {
    const errorResult = JSON.stringify({ error: '未搜寻到相关新闻' });

    (startAnalysisIpc as any).mockResolvedValue(errorResult);

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toBe('未搜寻到相关新闻');
  });

  it('应该能正确处理网络异常情况', async () => {
    (startAnalysisIpc as any).mockRejectedValue(new Error('网络错误'));

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toBe('网络错误');
  });
});
