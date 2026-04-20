import { useState } from 'react';
import { startAnalysis as startAnalysisIpc, getStockInfo as getStockInfoIpc } from '../lib/ipc';
import { FullAnalysisResponse, StockInfo } from '../../shared/types';

export type AnalysisStep = 'idle' | 'fetching_info' | 'scraping' | 'extracting' | 'analyzing' | 'completed' | 'error';

/**
 * 股票分析 Hook
 * 封装分析流程、状态管理和细分进度
 */
export function useAnalysis() {
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);
  const [partialInfo, setPartialInfo] = useState<StockInfo | null>(null);

  /**
   * 执行股票分析
   * @param symbol 股票代码
   */
  async function performAnalysis(symbol: string) {
    if (!symbol) return;

    setStep('fetching_info');
    setError(null);
    setResult(null);
    setPartialInfo(null);

    // 1. 立即获取基本信息（提升搜索反馈速度）
    try {
      const info = await getStockInfoIpc(symbol);
      setPartialInfo(info);
    } catch (err) {
      console.warn('获取股票基本信息失败:', err);
      // 忽略此错误，继续执行完整分析
    }

    setStep('scraping');

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
    partialInfo,
    performAnalysis
  };
}
