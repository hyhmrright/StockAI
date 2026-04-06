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
      price: 150,
      change: 2.5,
      change_percent: 1.7,
      summary: '看涨',
      sentiment: { bullish: 80, bearish: 20 },
      news: []
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
