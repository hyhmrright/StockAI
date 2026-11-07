import type { LedgerTransaction, KlinePoint } from '../../shared/types';
import { computeLedger } from './research-ledger';
/** 日末现金流假设下的 TWR；报价缺失或本金非正时不给虚假的收益率。 */
export function ledgerPerformance(
  transactions: LedgerTransaction[],
  history: Record<string, KlinePoint[]>,
) {
  const rows = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const days = [
    ...new Set([
      ...rows.map((t) => t.date),
      ...Object.values(history).flatMap((b) =>
        b.map((p) => new Date(p.time * 1000).toISOString().slice(0, 10)),
      ),
    ]),
  ]
    .filter((d) => rows[0] && d >= rows[0].date)
    .sort();
  let factor = 1,
    previous: number | null = null,
    valid = true;
  const lastPrices: Record<string, number> = {};
  const curve: { date: string; equity: number | null; twr: number | null }[] = [];
  for (const day of days) {
    for (const [symbol, bars] of Object.entries(history)) {
      const bar = bars.find((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === day);
      if (bar) lastPrices[symbol] = bar.close;
    }
    const accounts = computeLedger(rows.filter((t) => t.date <= day));
    if (accounts.length > 1) throw new Error('Select a single account and currency');
    const account = accounts[0];
    if (!account) continue;
    const missing = account.positions.some(
      (p) => p.shares > 0 && lastPrices[p.symbol] === undefined,
    );
    const equity = missing
      ? null
      : account.cash +
        account.positions.reduce(
          (s, p) => s + (p.shares > 0 ? p.shares * lastPrices[p.symbol] : 0),
          0,
        );
    const flow = rows
      .filter((t) => t.date === day)
      .reduce(
        (s, t) => s + (t.kind === 'deposit' ? t.amount : t.kind === 'withdrawal' ? -t.amount : 0),
        0,
      );
    if (equity === null || (previous !== null && previous > 0 && equity <= 0)) valid = false;
    if (valid && equity !== null && previous !== null && previous > 0)
      factor *= (equity - flow) / previous;
    const twr = valid && equity !== null && previous !== null && previous > 0 ? factor - 1 : null;
    curve.push({ date: day, equity, twr });
    previous = equity;
  }
  return curve;
}
