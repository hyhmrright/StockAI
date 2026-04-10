import { useState } from 'react';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { FullAnalysisResponse } from '../../shared/types';

export type AnalysisStep = 'idle' | 'scraping' | 'extracting' | 'analyzing' | 'completed' | 'error';

/**
 * 股票分析 Hook
 * 封装分析流程、状态管理和细分进度
 */
export function useAnalysis() {
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);

  /**
   * 执行股票分析
   * @param symbol 股票代码
   */
  async function performAnalysis(symbol: string) {
    if (!symbol) return;

    setStep('scraping');
    setError(null);
    setResult(null);

    try {
      // IPC 层负责 JSON 解析、错误提取和结构验证；此处直接获得强类型结果
      const analysisResult = await startAnalysisIpc(symbol);
      setStep('analyzing');
      setResult(analysisResult);
      setStep('completed');
    } catch (err) {
      console.error('分析执行失败:', err);
      const msg = err instanceof Error ? err.message : '分析过程中发生错误，请重试。';
      setError(msg);
      setStep('error');
    }
  }

  return {
    step,
    loading: step !== 'idle' && step !== 'completed' && step !== 'error',
    error,
    result,
    performAnalysis
  };
}
