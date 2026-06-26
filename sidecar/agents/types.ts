import type {
  QuantBundle,
  StockNews,
  MasterMeta,
  MasterSignal,
  Language,
} from '../../shared/types';

export type { MasterSignal };

/** LLM 聊天接口——从现有 provider 中抽出的最小接口，供 agent 使用 */
export interface ChatProvider {
  chat(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** 传入每个大师的分析上下文 */
export interface MasterAnalysisContext {
  symbol: string;
  quant: QuantBundle;
  news: StockNews[];
  chat: ChatProvider;
  language?: Language;
}

/** 大师 Agent 接口 */
export interface MasterAgent {
  meta: MasterMeta;
  analyze(ctx: MasterAnalysisContext): Promise<MasterSignal>;
}
