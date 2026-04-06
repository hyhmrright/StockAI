import { useState } from 'react';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { FullAnalysisResponse } from '../lib/api-types';

/**
 * 股票分析 Hook
 * 封装分析流程、状态管理和错误处理
 */
export function useAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);

  /**
   * 执行股票分析
   * @param symbol 股票代码
   */
  const performAnalysis = async (symbol: string) => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const responseStr = await startAnalysisIpc(symbol);
      const parsed: FullAnalysisResponse = JSON.parse(responseStr);
      setResult(parsed);
    } catch (err: any) {
      console.error('分析执行失败:', err);
      setError(err.message || '分析过程中发生错误，请重试。');
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    result,
    performAnalysis
  };
}
