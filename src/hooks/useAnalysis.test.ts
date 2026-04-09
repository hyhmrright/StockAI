import { renderHook, act } from '@testing-library/react';
import { useAnalysis } from './useAnalysis';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { vi, describe, it, expect } from 'vitest';

// 模拟 IPC 调用
vi.mock('../lib/ipc', () => ({
  startAnalysis: vi.fn(),
}));

describe('useAnalysis Hook', () => {
  it('应该能正常处理分析流程的状态流转', async () => {
    const mockResult = JSON.stringify({
      symbol: 'AAPL',
      news: [{ title: '测试新闻', source: 'Test', date: '2025-01-01', content: '', url: '' }],
      analysis: {
        rating: 75,
        sentiment: 'bullish',
        summary: '看涨信号明显',
        pros: ['业绩增长'],
        cons: ['估值偏高']
      }
    });

    (startAnalysisIpc as any).mockResolvedValue(mockResult);

    const { result } = renderHook(() => useAnalysis());

    expect(result.current.step).toBe('idle');

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('completed');
    expect(result.current.result?.symbol).toBe('AAPL');
    expect(result.current.error).toBeNull();
  });

  it('JSON 缺少 analysis 字段时应该报验证错误', async () => {
    const invalidResult = JSON.stringify({
      symbol: 'AAPL',
      news: [{ title: '测试', source: 'Test', date: '', content: '', url: '' }],
      // 缺少 analysis 字段
    });

    (startAnalysisIpc as any).mockResolvedValue(invalidResult);

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

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

  it('应该能正确处理错误情况', async () => {
    (startAnalysisIpc as any).mockRejectedValue(new Error('网络错误'));

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toBe('网络错误');
  });
});
