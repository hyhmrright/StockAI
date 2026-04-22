import { FullAnalysisResponse, StockInfo } from '../../shared/types';
import * as ipc from './ipc';

/**
 * 股票分析服务接口
 */
export interface AnalysisService {
  startAnalysis(symbol: string): Promise<FullAnalysisResponse>;
  getStockInfo(symbol: string): Promise<StockInfo | null>;
}

/**
 * 基于 Tauri IPC 的生产实现
 */
export const ipcAnalysisService: AnalysisService = {
  startAnalysis: (symbol: string) => ipc.startAnalysis(symbol),
  getStockInfo: (symbol: string) => ipc.getStockInfo(symbol),
};
