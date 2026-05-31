import type {
  MasterSignalRecord,
  MasterLeaderboardEntry,
  MasterNavPoint,
  MasterPortfolioData,
} from "../../shared/types";

/**
 * 虚拟大师组合展示层的纯计算核心（前向跟踪 · 轨道 A）。
 *
 * 口径（与 UI 披露文案一致，须保持诚实）：
 *  - 命中率：仅方向信号（排除中性），从落账价 priceAt 到当前价 priceNow 的方向是否兑现。
 *    看涨命中 = 涨；看跌命中 = 跌。缺入场价或缺现价的信号判为「待定」，不纳入分母。
 *  - 平均收益：已裁决信号的方向调整收益均值（看跌取相反数，故命中即为正）。
 *  - 净值曲线：把同一大师的已裁决信号按时间排序，假设每次等额全仓、顺序复利，
 *    含未平仓浮盈（mark-to-current）。起点净值 1.0。
 *
 * 纯函数：signals + 现价表 + 计算时刻进，聚合结果出，无 IO，便于离线测试。
 */
function isResolvable(s: MasterSignalRecord, priceNow: number | undefined): priceNow is number {
  return (
    s.signal !== "neutral" &&
    s.priceAt != null &&
    s.priceAt > 0 &&
    typeof priceNow === "number" &&
    Number.isFinite(priceNow) &&
    priceNow > 0
  );
}

/** 方向调整收益：看涨取涨幅，看跌取相反数（priceAt 已由 isResolvable 保证 > 0） */
function directionReturn(s: MasterSignalRecord, priceNow: number): number {
  const entry = s.priceAt as number;
  const raw = (priceNow - entry) / entry;
  return s.signal === "bearish" ? -raw : raw;
}

export function computeMasterPortfolio(
  signals: MasterSignalRecord[],
  priceMap: Record<string, number>,
  asOf: number,
): MasterPortfolioData {
  // 按大师分组，保留落账时间顺序
  const byMaster = new Map<string, MasterSignalRecord[]>();
  for (const s of signals) {
    const list = byMaster.get(s.masterId) ?? [];
    list.push(s);
    byMaster.set(s.masterId, list);
  }

  const leaderboard: MasterLeaderboardEntry[] = [];
  const navCurves: Record<string, MasterNavPoint[]> = {};
  let resolvedSignals = 0;
  const firstSignalAt = signals.length
    ? signals.reduce((min, s) => Math.min(min, s.recordedAt), Infinity)
    : null;

  for (const [masterId, list] of byMaster) {
    const resolved = [...list]
      .filter(s => isResolvable(s, priceMap[s.symbol]))
      .sort((a, b) => a.recordedAt - b.recordedAt);

    let hits = 0;
    let sumReturn = 0;
    let nav = 1;
    const curve: MasterNavPoint[] = [];

    for (const s of resolved) {
      const r = directionReturn(s, priceMap[s.symbol]);
      if (r > 0) hits++;
      sumReturn += r;
      nav *= 1 + r;
      curve.push({ time: s.recordedAt, value: nav });
    }

    const lastSignalAt = list.reduce((m, s) => Math.max(m, s.recordedAt), 0);
    leaderboard.push({
      masterId,
      total: list.length,
      resolved: resolved.length,
      pending: list.length - resolved.length,
      hits,
      hitRate: resolved.length > 0 ? hits / resolved.length : null,
      avgReturn: resolved.length > 0 ? sumReturn / resolved.length : null,
      lastSignalAt,
    });
    if (curve.length > 0) navCurves[masterId] = curve;
    resolvedSignals += resolved.length;
  }

  // 命中率降序；null（全待定）垫底；同命中率按样本量、再按平均收益降序
  leaderboard.sort((a, b) => {
    if (a.hitRate === null && b.hitRate === null) return b.resolved - a.resolved;
    if (a.hitRate === null) return 1;
    if (b.hitRate === null) return -1;
    if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
    if (b.resolved !== a.resolved) return b.resolved - a.resolved;
    return (b.avgReturn ?? 0) - (a.avgReturn ?? 0);
  });

  return {
    leaderboard,
    navCurves,
    totalSignals: signals.length,
    resolvedSignals,
    firstSignalAt,
    asOf,
  };
}
