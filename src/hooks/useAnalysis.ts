import { useState, useRef } from 'react';
import { FullAnalysisResponse, StockInfo } from '../../shared/types';
import { AnalysisService, ipcAnalysisService } from '../lib/api';

export type AnalysisStep = 'idle' | 'fetching_info' | 'scraping' | 'extracting' | 'analyzing' | 'completed' | 'error';

/**
 * 股票分析 Hook
 * 封装分析流程、状态管理和细分进度
 */
export function useAnalysis(service: AnalysisService = ipcAnalysisService) {
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);
  const [partialInfo, setPartialInfo] = useState<StockInfo | null>(null);
  
  // 用于追踪最新请求，防止异步竞争导致的状态错乱
  const latestRequestId = useRef(0);

  /**
   * 执行股票分析
   * @param symbol 股票代码
   */
  async function performAnalysis(symbol: string) {
    if (!symbol) return;

    const requestId = ++latestRequestId.current;
    
    setStep('scraping');
    setError(null);
    setResult(null);
    setPartialInfo(null);

    // getStockInfo 与 startAnalysis 输入相同、结果互不依赖，并发启动消除串行延迟
    const infoPromise = service.getStockInfo(symbol).then(info => {
      if (requestId !== latestRequestId.current) return;
      setPartialInfo(info);
    }).catch(err => {
      console.warn('获取股票基本信息失败:', err);
    });

    try {
      // IPC 层负责 JSON 解析、错误提取和结构验证；此处直接获得强类型结果
      const analysisResult = await service.startAnalysis(symbol);

      if (requestId !== latestRequestId.current) return;

      await infoPromise;
      setResult(analysisResult);
      setStep('completed');
    } catch (err) {
      if (requestId !== latestRequestId.current) return;

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
