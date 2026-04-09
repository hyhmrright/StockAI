import { useState } from 'react';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { FullAnalysisResponse } from '../lib/api-types';

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
      const responseStr = await startAnalysisIpc(symbol);

      // 模拟步骤流转 (因为目前的 IPC 是阻塞式的)
      setStep('analyzing');

      if (!responseStr || responseStr.trim() === '') {
        throw new Error('分析服务无响应，请检查 AI 模型配置后重试。');
      }

      const parsed = JSON.parse(responseStr) as FullAnalysisResponse & { error?: string };

      // Sidecar 遇到错误时会输出 { error: "..." }
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      // 验证响应结构完整性
      if (!parsed.analysis || typeof parsed.analysis.rating !== 'number' || !Array.isArray(parsed.news)) {
        throw new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。');
      }

      setResult(parsed);
      setStep('completed');
    } catch (err) {
      console.error('分析执行失败:', err);
      const msg = err instanceof Error ? err.message : '分析过程中发生错误，请重试。';
      setError(msg);
      setStep('error');
    }
  };

  return {
    step,
    loading: step !== 'idle' && step !== 'completed' && step !== 'error',
    error,
    result,
    performAnalysis
  };
}
