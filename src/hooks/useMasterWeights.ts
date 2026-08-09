import { useCallback, useEffect, useRef, useState } from 'react';
import type { MasterWeightInput } from '../../shared/types';
import { getAllMasterSignals } from '../lib/db';
import { fetchRealtimeQuotes } from '../lib/ipc';
import {
  deriveMasterWeights,
  loadMasterPortfolio,
  type PriceFetcher,
  type SignalsFetcher,
} from '../lib/masterPortfolio';

export interface UseMasterWeightsResult {
  weights: MasterWeightInput[];
  refetch: () => void;
}

/** 一次进程拉完整组；symbol 数没有上限，逐只取价会按标的数放大 sidecar 进程数 */
const defaultPriceFetcher: PriceFetcher = async (symbols) => {
  const { quotes } = await fetchRealtimeQuotes(symbols);
  return Object.fromEntries(Object.entries(quotes).map(([sym, q]) => [sym, q.price]));
};

/**
 * 大师动态权重「命中率生产者」：全局（非按 symbol）加载战绩 → 派生权重快照。
 *
 * best-effort 语义（关键）：任何取数失败 / 空历史都静默退化为空数组 `[]`——
 * sidecar 侧对空数组按默认权重 1.0 处理，绝不抛错阻塞正常分析流程。分析触发时若权重还没算好，
 * 消费方传 `[]` 即可（退化默认权重），不阻塞/延迟分析。
 *
 * 取数流水线复用 masterPortfolio.ts 的 loadMasterPortfolio，不在此重复「拉信号→拉现价→聚合」。
 * 新分析落账后调 refetch 刷新权重快照。
 */
export function useMasterWeights(
  loadSignals: SignalsFetcher = getAllMasterSignals,
  loadPrice: PriceFetcher = defaultPriceFetcher,
): UseMasterWeightsResult {
  const [weights, setWeights] = useState<MasterWeightInput[]>([]);
  const [trigger, setTrigger] = useState(0);
  const latestRequestId = useRef(0);
  const fns = useRef({ loadSignals, loadPrice });
  fns.current = { loadSignals, loadPrice };

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    loadMasterPortfolio(fns.current.loadSignals, fns.current.loadPrice)
      .then((data) => {
        if (requestId !== latestRequestId.current) return;
        setWeights(deriveMasterWeights(data));
      })
      .catch(() => {
        // best-effort：取数失败静默降级为空数组（默认权重），不阻塞分析
        if (requestId !== latestRequestId.current) return;
        setWeights([]);
      });
  }, [trigger]);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  return { weights, refetch };
}
