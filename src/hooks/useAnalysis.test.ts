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
    // IPC 现在直接返回强类型对象，不再是 JSON 字符串
    (startAnalysisIpc as any).mockResolvedValue(createMockAnalysisResponse({ symbol }));

    const { result } = renderHook(() => useAnalysis());
    expect(result.current.step).toBe('idle');

    await act(async () => {
      await result.current.performAnalysis(symbol);
    });

    expect(startAnalysisIpc).toHaveBeenCalledWith(symbol);
    expect(result.current.step).toBe('completed');
    expect(result.current.result?.symbol).toBe(symbol);
    expect(result.current.error).toBeNull();
  });

  it('IPC 层抛出格式验证错误时应展示错误', async () => {
    // 验证逻辑已移至 ipc.ts；useAnalysis 只需正确处理 rejected promise
    (startAnalysisIpc as any).mockRejectedValue(
      new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。')
    );

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain('格式异常');
  });

  it('IPC 层抛出空响应错误时应展示错误', async () => {
    (startAnalysisIpc as any).mockRejectedValue(
      new Error('分析服务无响应，请检查 AI 模型配置后重试。')
    );

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toContain('无响应');
  });

  it('Sidecar 返回 error JSON 时应展示错误信息', async () => {
    // ipc.ts 已将 { error: "..." } 转换为 thrown Error
    (startAnalysisIpc as any).mockRejectedValue(new Error('未搜寻到相关新闻'));

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
