import type { QuantBundle, StockNews, DeepAnalysisResult } from '../shared/types';
import type { ChatProvider, MasterAnalysisContext } from './agents/types';
import { getSelectedMasters, DEFAULT_MASTER_IDS } from './agents/registry';
import { analyzeSentiment } from './agents/sentiment';
import { synthesize } from './agents/synthesizer';
import { logger } from './utils';

export interface DeepAnalysisOptions {
  symbol: string;
  quant: QuantBundle;
  news: StockNews[];
  chat: ChatProvider;
  selectedMasters?: string[];
}

export async function runDeepAnalysis(opts: DeepAnalysisOptions): Promise<DeepAnalysisResult> {
  const { symbol, quant, news, chat, selectedMasters = DEFAULT_MASTER_IDS } = opts;

  let masters = getSelectedMasters(selectedMasters);
  if (masters.length === 0) {
    logger.warn('未找到有效的大师配置，使用默认列表');
    masters = getSelectedMasters(DEFAULT_MASTER_IDS);
  }

  const ctx: MasterAnalysisContext = { symbol, quant, news, chat };

  const [masterResults, sentimentResult] = await Promise.all([
    Promise.all(masters.map(m => m.analyze(ctx))),
    analyzeSentiment(news, chat),
  ]);

  return synthesize(masterResults, sentimentResult, quant, chat);
}
