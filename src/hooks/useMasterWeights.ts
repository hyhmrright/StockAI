import { analysisModelFingerprint } from '../../shared/analysis-version';
import { PROVIDER_PROFILES, useSettings } from './useSettings';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterWeightInput } from '../../shared/types';
import { getAllMasterSignals } from '../lib/db';
import { loadMasterHistory } from '../lib/master-history';
import {
  deriveMasterWeights,
  loadMasterEvaluation,
  type HistoryFetcher,
  type SignalsFetcher,
} from '../lib/masterPortfolio';

export interface UseMasterWeightsResult {
  weights: MasterWeightInput[];
  refetch: () => void;
}

/**
 * 大师动态权重「命中率生产者」：全局（非按 symbol）加载战绩 → 派生权重快照。
 *
 * best-effort 语义（关键）：任何取数失败 / 空历史都静默退化为空数组 `[]`——
 * sidecar 侧对空数组按默认权重 1.0 处理，绝不抛错阻塞正常分析流程。分析触发时若权重还没算好，
 * 消费方传 `[]` 即可（退化默认权重），不阻塞/延迟分析。
 *
 * 取数流水线复用 masterPortfolio.ts 的 loadMasterEvaluation，不在此重复「信号→历史→到期评价」。
 * 新分析落账后调 refetch 刷新权重快照。
 */
export function useMasterWeights(
  loadSignals: SignalsFetcher = getAllMasterSignals,
  loadHistory: HistoryFetcher = loadMasterHistory,
): UseMasterWeightsResult {
  const { settings } = useSettings();
  const fallback = {
    provider: settings.activeProvider,
    model:
      settings.providerConfigs[settings.activeProvider]?.model ??
      PROVIDER_PROFILES[settings.activeProvider].model,
  };
  const modelFingerprint = analysisModelFingerprint(
    settings.roleModels.brain ?? fallback,
    settings.roleModels.quick ?? fallback,
  );
  const [weights, setWeights] = useState<MasterWeightInput[]>([]);
  const [trigger, setTrigger] = useState(0);
  const latestRequestId = useRef(0);
  const fns = useRef({ loadSignals, loadHistory });
  fns.current = { loadSignals, loadHistory };

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    loadMasterEvaluation(fns.current.loadSignals, fns.current.loadHistory, 20, modelFingerprint)
      .then((data) => {
        if (requestId !== latestRequestId.current) return;
        setWeights(deriveMasterWeights(data));
      })
      .catch(() => {
        // best-effort：取数失败静默降级为空数组（默认权重），不阻塞分析
        if (requestId !== latestRequestId.current) return;
        setWeights([]);
      });
  }, [trigger, modelFingerprint]);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  return { weights, refetch };
}
