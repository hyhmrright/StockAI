import { describe, it, expect } from 'vitest';
import { computeLedger, ledgerCsv, parseLedgerCsv } from './research-ledger';
import type { LedgerTransaction } from '../../shared/types';
const tx = (p: Partial<LedgerTransaction>): LedgerTransaction => ({
  id: crypto.randomUUID(),
  account: 'main',
  symbol: 'AAPL',
  currency: 'USD',
  date: '2026-01-01',
  kind: 'buy',
  shares: 10,
  price: 100,
  amount: 0,
  fees: 1,
  note: '',
  ...p,
});
describe('transaction ledger', () => {
  it('releases average cost including buy fees, tracks cash/dividends and realized net P/L', () => {
    const rows = [
      tx({ kind: 'deposit', amount: 2000, fees: 0 }),
      tx({}),
      tx({ kind: 'sell', shares: 5, price: 110, date: '2026-01-02' }),
      tx({ kind: 'dividend', amount: 10, fees: 2, date: '2026-01-03' }),
    ];
    const a = computeLedger(rows)[0];
    expect(a.cash).toBe(1556);
    expect(a.positions[0]).toMatchObject({ shares: 5, cost: 500.5, realized: 48.5, dividends: 8 });
  });
  it('does not mix currencies or accounts', () =>
    expect(
      computeLedger([tx({}), tx({ currency: 'CNY' }), tx({ account: 'second' })]),
    ).toHaveLength(3));
  it('rejects overselling and nonfinite amounts before persistence', () => {
    expect(() => computeLedger([tx({ kind: 'sell' })])).toThrow();
    expect(() => computeLedger([tx({ fees: NaN })])).toThrow();
  });
  it('split changes shares without manufacturing cost or realized gains', () => {
    const p = computeLedger([tx({}), tx({ kind: 'split', shares: 4, date: '2026-02-01' })])[0]
      .positions[0];
    expect(p.shares).toBe(40);
    expect(p.cost).toBe(1001);
    expect(p.realized).toBe(0);
  });
  it('CSV roundtrips embedded commas, quotes, line breaks and UTF-8', () => {
    const rows = [tx({ note: '财报, "复盘"\nnext line' })];
    expect(parseLedgerCsv('\uFEFF' + ledgerCsv(rows))).toEqual(rows);
  });
  it('malformed CSV and duplicate IDs fail as a whole', () => {
    expect(() => parseLedgerCsv('bad')).toThrow();
    const t = tx({});
    expect(() => parseLedgerCsv(ledgerCsv([t, t]))).toThrow();
  });
});
