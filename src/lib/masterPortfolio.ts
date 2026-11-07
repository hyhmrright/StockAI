import type {
  MasterSignalRecord,
  MasterPortfolioData,
  MasterWeightInput,
  KlinePoint,
} from '../../shared/types';
import { evaluateMasterSignals } from './master-evaluation';
export type SignalsFetcher = () => Promise<MasterSignalRecord[]>;
export type HistoryFetcher = (
  signals: MasterSignalRecord[],
) => Promise<Record<string, KlinePoint[]>>;
/** 榜单与动态权重走同一条固定持有期流水线，测试替换 IO 而不替换评价规则。 */
export async function loadMasterEvaluation(
  loadSignals: SignalsFetcher,
  loadHistory: HistoryFetcher,
  horizon = 20,
  model?: string,
): Promise<MasterPortfolioData> {
  const all = await loadSignals();
  const signals = model ? all.filter((s) => s.modelFingerprint === model) : all;
  const history = signals.length ? await loadHistory(signals) : {};
  return evaluateMasterSignals(signals, history, horizon);
}
export function deriveMasterWeights(data: MasterPortfolioData): MasterWeightInput[] {
  return data.leaderboard
    .filter((e) => e.hitRate !== null)
    .map((e) => ({ masterId: e.masterId, sampleSize: e.resolved, hits: e.hits }));
}
