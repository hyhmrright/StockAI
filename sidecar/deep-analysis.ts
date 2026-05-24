import type { QuantBundle, StockNews, DeepAnalysisResult, MasterSignal } from '../shared/types';
import type { ChatProvider, MasterAgent, MasterAnalysisContext } from './agents/types';
import { getSelectedMasters, DEFAULT_MASTER_IDS } from './agents/registry';
import { analyzeSentiment } from './agents/sentiment';
import { synthesize } from './agents/synthesizer';
import { logger } from './utils';

const MAX_CONCURRENCY = 4;

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

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

  const masterTasks = masters.map((m: MasterAgent) => () => m.analyze(ctx));
  const [masterResults, sentimentResult] = await Promise.all([
    runWithConcurrency<MasterSignal>(masterTasks, MAX_CONCURRENCY),
    analyzeSentiment(news, chat),
  ]);

  return synthesize(masterResults, sentimentResult, quant, chat);
}
