// Sidecar 类型 — 共享类型从统一来源重新导出
export type { StockNews, AIAnalysisResult } from '../shared/types';

// Sidecar 专用类型
import type { StockNews } from '../shared/types';

export interface AnalysisPayload {
  symbol: string;  // 股票代码
  news: StockNews[]; // 相关新闻列表
}
