// 本地分析历史（SQLite analysis_records 表的读写契约）
/** 分析类型 */
export type AnalysisType = 'ai' | 'deep' | 'quant' | 'backtest' | 'screener';

/** 分析历史记录摘要（列表查询用，不含 news_json） */
export interface AnalysisRecordSummary {
  id: number;
  symbol: string;
  analyzedAt: number;
  type: AnalysisType;
  resultJson: string;
  stockInfoJson: string | null;
}

/** 分析历史完整记录（含 news_json） */
export interface AnalysisRecord extends AnalysisRecordSummary {
  newsJson: string | null;
}

/** 保存分析记录的参数 */
export interface SaveAnalysisParams {
  symbol: string;
  analysisType: AnalysisType;
  resultJson: string;
  stockInfoJson?: string;
  newsJson?: string;
}

/** 查询历史记录的参数 */
export interface HistoryQuery {
  symbol: string;
  analysisType?: AnalysisType;
  limit?: number;
  offset?: number;
}
