import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPositions, upsertPosition, updatePosition, deletePosition } from '../lib/positions-db';
import { buildOverview } from '../lib/portfolio';
import { useQuotes } from './useQuotes';
import type { Position, PositionInput, PortfolioOverview } from '../../shared/types';

/**
 * 用户持仓：SQLite 是唯一真源，内存态只是它的镜像。
 *
 * 每次增删改后整表重读而不是就地拼接本地数组——加仓要按加权平均合并成本，
 * 那笔计算发生在 db 层，本地凭入参猜合并结果迟早会和库里对不上。
 * 持仓表规模是几十行量级，重读的代价可以忽略。
 *
 * 现价复用 useQuotes（与关注列表同一套批量取价与交易时段规则），估值走
 * lib/portfolio.ts 的纯函数，本 hook 只负责把两者接起来。
 */
export function usePortfolio(): {
  positions: Position[];
  overview: PortfolioOverview;
  loading: boolean;
  error: unknown;
  add: (input: PositionInput) => Promise<void>;
  update: (
    id: number,
    patch: { shares: number; costPrice: number; note?: string },
  ) => Promise<void>;
  remove: (id: number) => Promise<void>;
} {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setPositions(await getPositions());
      setError(null);
    } catch (err) {
      // 读不出持仓时保留上一次的列表：清空会让用户以为持仓丢了
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);
  const { quotes } = useQuotes(symbols);

  const overview = useMemo(() => buildOverview(positions, quotes), [positions, quotes]);

  /** 写操作统一：失败记 error 而不抛，成功后整表重读 */
  const mutate = useCallback(
    async (op: () => Promise<unknown>) => {
      try {
        await op();
        setError(null);
      } catch (err) {
        setError(err);
        return;
      }
      await reload();
    },
    [reload],
  );

  return {
    positions,
    overview,
    loading,
    error,
    add: useCallback((input: PositionInput) => mutate(() => upsertPosition(input)), [mutate]),
    update: useCallback(
      (id: number, patch: { shares: number; costPrice: number; note?: string }) =>
        mutate(() => updatePosition(id, patch)),
      [mutate],
    ),
    remove: useCallback((id: number) => mutate(() => deletePosition(id)), [mutate]),
  };
}
