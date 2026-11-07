import { detectMarket } from '../../shared/market';
import type {
  KlinePoint,
  MasterSignalRecord,
  MasterPortfolioData,
  MasterNavPoint,
} from '../../shared/types';
/** 统一持有期，使用信号之后第一个交易日收盘入场，满 N 个交易日才裁决。 */
export function evaluateMasterSignals(
  signals: MasterSignalRecord[],
  history: Record<string, KlinePoint[]>,
  horizon = 20,
): MasterPortfolioData {
  const rows = new Map<
    string,
    { total: number; returns: number[]; excess: number[]; curve: MasterNavPoint[] }
  >();
  for (const signal of [...signals].sort((a, b) => a.recordedAt - b.recordedAt)) {
    const row = rows.get(signal.masterId) ?? { total: 0, returns: [], excess: [], curve: [] };
    rows.set(signal.masterId, row);
    row.total++;
    if (signal.signal === 'neutral') continue;
    const bars = (history[signal.symbol] ?? [])
      .filter((b) => b.time * 1000 > signal.recordedAt)
      .sort((a, b) => a.time - b.time);
    if (bars.length <= horizon || bars[0].close <= 0) continue;
    const value =
      (bars[horizon].close / bars[0].close - 1) * (signal.signal === 'bearish' ? -1 : 1);
    row.returns.push(value);
    const benchmark = history[detectMarket(signal.symbol) === 'A股' ? 'sh000300' : '^GSPC'] ?? [];
    const date = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
    const entry = benchmark.find((b) => date(b.time) === date(bars[0].time));
    const exit = benchmark.find((b) => date(b.time) === date(bars[horizon].time));
    if (entry && exit && entry.close > 0)
      row.excess.push(
        value - (exit.close / entry.close - 1) * (signal.signal === 'bearish' ? -1 : 1),
      );
    // 曲线是到期样本的算术均值，明确不冒充资金净值。
    row.curve.push({
      time: bars[horizon].time * 1000,
      value: 1 + value,
    });
  }
  const leaderboard = [...rows]
    .map(([masterId, row]) => ({
      masterId,
      total: row.total,
      resolved: row.returns.length,
      pending: row.total - row.returns.length,
      hits: row.returns.filter((v) => v > 0).length,
      hitRate: row.returns.length
        ? row.returns.filter((v) => v > 0).length / row.returns.length
        : null,
      avgExcessReturn: row.excess.length
        ? row.excess.reduce((sum, v) => sum + v, 0) / row.excess.length
        : null,
      avgReturn: row.returns.length
        ? row.returns.reduce((a, b) => a + b, 0) / row.returns.length
        : null,
    }))
    .sort((a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1));
  return {
    leaderboard,
    navCurves: Object.fromEntries(
      [...rows].map(([id, row]) => {
        let sum = 0;
        return [
          id,
          row.curve
            .sort((a, b) => a.time - b.time)
            .map((p, i) => {
              sum += p.value - 1;
              return { ...p, value: 1 + sum / (i + 1) };
            }),
        ];
      }),
    ),
    totalSignals: signals.length,
    resolvedSignals: leaderboard.reduce((s, x) => s + x.resolved, 0),
    firstSignalAt: signals.length ? Math.min(...signals.map((s) => s.recordedAt)) : null,
    asOf: Date.now(),
  };
}
/** 固定等额分配给各标的；看涨入场，中性/看跌退出。看跌不模拟做空。 */
export function simulateMasterPortfolio(
  signals: MasterSignalRecord[],
  history: Record<string, KlinePoint[]>,
  initialCapital = 100000,
  cost = 0.001,
): MasterNavPoint[] {
  const symbols = [...new Set(signals.map((s) => s.symbol))];
  if (!symbols.length) return [];
  const wallets = new Map(
    symbols.map((symbol) => [
      symbol,
      { cash: initialCapital / symbols.length, shares: 0, last: 0 },
    ]),
  );
  const events = [...signals].sort((a, b) => a.recordedAt - b.recordedAt);
  const times = [
    ...new Set(Object.values(history).flatMap((bars) => bars.map((b) => b.time))),
  ].sort((a, b) => a - b);
  const curve: MasterNavPoint[] = [];
  const byTime = new Map(
    Object.entries(history).map(([s, bars]) => [s, new Map(bars.map((b) => [b.time, b]))]),
  );
  const used = new Set<number>();
  for (const time of times) {
    for (const symbol of symbols) {
      const bar = byTime.get(symbol)?.get(time);
      const wallet = wallets.get(symbol)!;
      if (!bar) continue;
      const pending = events.filter(
        (e) => e.symbol === symbol && e.recordedAt < time * 1000 && !used.has(e.id),
      );
      const event = pending[pending.length - 1];
      pending.forEach((e) => used.add(e.id));
      if (event && bar.volume > 0 && bar.open > 0) {
        if (event.signal === 'bullish' && wallet.shares === 0) {
          wallet.shares = wallet.cash / (bar.open * (1 + cost));
          wallet.cash = 0;
        } else if (event.signal !== 'bullish' && wallet.shares > 0) {
          wallet.cash = wallet.shares * bar.open * (1 - cost);
          wallet.shares = 0;
        }
      }
      wallet.last = bar.close;
    }
    if (signals.some((s) => s.recordedAt < time * 1000))
      curve.push({
        time: time * 1000,
        value:
          [...wallets.values()].reduce((sum, w) => sum + w.cash + w.shares * w.last, 0) /
          initialCapital,
      });
  }
  return curve;
}
