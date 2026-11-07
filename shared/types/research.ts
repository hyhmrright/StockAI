import type { QuantBundle, StockNews, DeepAnalysisResult, ReportChunk } from './index';

export interface ResearchNote {
  id: string;
  symbol: string;
  thesis: string;
  counterEvidence: string;
  reviewDate: string;
  status: 'open' | 'confirmed' | 'invalidated';
  analysisId?: string;
  createdAt: number;
  updatedAt: number;
}
export interface ResearchSnapshot {
  symbol: string;
  capturedAt: number;
  quant?: QuantBundle;
  news: StockNews[];
  deep?: DeepAnalysisResult;
}
export type TransactionKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'split';
export interface LedgerTransaction {
  id: string;
  account: string;
  symbol: string;
  currency: 'CNY' | 'USD';
  kind: TransactionKind;
  date: string;
  shares: number;
  price: number;
  amount: number;
  fees: number;
  note: string;
}
export interface ResearchDocument {
  id: string;
  symbol: string;
  title: string;
  date: string;
  url?: string;
  chunks: ReportChunk[];
}
export interface ResearchEvent {
  id: string;
  symbol: string;
  date: string;
  title: string;
  url?: string;
  read: boolean;
  kind: 'news' | 'review' | 'score' | 'calendar' | 'price';
}
export interface ResearchWorkspace {
  pricing?: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
  version: 1;
  notes: ResearchNote[];
  ledger: LedgerTransaction[];
  documents: ResearchDocument[];
  snapshots: Record<string, ResearchSnapshot[]>;
  events: ResearchEvent[];
  peers: string[];
  savedScreens: { id: string; title: string; query: string }[];
}
export interface TaskEvent {
  type: 'master' | 'usage' | 'phase';
  master?: import('./masters').MasterSignal;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  phase?: string;
}
