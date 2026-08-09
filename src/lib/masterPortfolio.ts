import type {
  MasterSignalRecord,
  MasterLeaderboardEntry,
  MasterNavPoint,
  MasterPortfolioData,
  MasterWeightInput,
} from '../../shared/types';

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
    s.signal !== 'neutral' &&
    s.priceAt != null &&
    s.priceAt > 0 &&
    typeof priceNow === 'number' &&
    Number.isFinite(priceNow) &&
    priceNow > 0
  );
}

/** 方向调整收益：看涨取涨幅，看跌取相反数（priceAt 已由 isResolvable 保证 > 0） */
function directionReturn(s: MasterSignalRecord, priceNow: number): number {
  const entry = s.priceAt as number;
  const raw = (priceNow - entry) / entry;
  return s.signal === 'bearish' ? -raw : raw;
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
      .filter((s) => isResolvable(s, priceMap[s.symbol]))
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

    leaderboard.push({
      masterId,
      total: list.length,
      resolved: resolved.length,
      pending: list.length - resolved.length,
      hits,
      hitRate: resolved.length > 0 ? hits / resolved.length : null,
      avgReturn: resolved.length > 0 ? sumReturn / resolved.length : null,
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

/** 取数依赖（DI）：读全量落账 signal / 按 symbol 回查现价。保持本模块无 IO，便于离线测试。 */
export type SignalsFetcher = () => Promise<MasterSignalRecord[]>;
/** 批量取价：一次拿整组，不接受逐只调用（见 loadMasterPortfolio 的说明） */
export type PriceFetcher = (symbols: string[]) => Promise<Record<string, number>>;

/**
 * 虚拟大师组合取数流水线（复用点）：读全量 signal → 按 symbol 去重**批量**回查现价 → 纯函数聚合。
 * 报价失败的 symbol 静默跳过（对应 signal 计入「待定」）。useMasterPortfolio 与 useMasterWeights 共用，
 * 避免「拉信号→拉现价→聚合」逻辑重复。
 *
 * **取价必须是批量的**：signal 表按分析过的标的数增长，这里的去重 symbol 集没有上限。
 * sidecar 是 spawn-per-call，逐只取价等于「分析过多少只股票，打开面板就同时起多少个进程」。
 * 这与 useAlertMonitor 从前逐只取价、以及各消费方各持一个轮询定时器是同一类缺陷，
 * 项目已经消灭过两次，不该在这里第三次犯（见 lib/quotes-store.ts 与 ipc.fetchRealtimeQuotes）。
 */
export async function loadMasterPortfolio(
  loadSignals: SignalsFetcher,
  loadPrices: PriceFetcher,
): Promise<MasterPortfolioData> {
  const signals = await loadSignals();
  const symbols = [...new Set(signals.map((s) => s.symbol))];
  // 整批取价失败时退化为空价表——全部 signal 计入「待定」，与逐只取价时代
  // 「每只各自失败、各自跳过」的结果一致：战绩榜照常渲染，不弹错误页。
  const raw: Record<string, number> =
    symbols.length > 0 ? await loadPrices(symbols).catch(() => ({})) : {};
  const priceMap: Record<string, number> = {};
  for (const sym of symbols) {
    const price = raw[sym];
    if (Number.isFinite(price)) priceMap[sym] = price;
  }
  return computeMasterPortfolio(signals, priceMap, Date.now());
}

/**
 * 从组合战绩榜派生 synthesizer 动态权重输入（跨层契约 MasterWeightInput[]）。
 * 过滤 hitRate===null（即 resolved===0，样本不足没战绩的大师）；映射 resolved→sampleSize、hits→hits。
 * 不传 hitRate——由 sidecar 自算 hits/sampleSize，避免与 UI 展示值的 rounding 分歧。
 */
export function deriveMasterWeights(data: MasterPortfolioData): MasterWeightInput[] {
  return data.leaderboard
    .filter((e) => e.hitRate !== null)
    .map((e) => ({ masterId: e.masterId, sampleSize: e.resolved, hits: e.hits }));
}
