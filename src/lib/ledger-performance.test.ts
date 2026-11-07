import { describe, it, expect } from 'vitest';
import { ledgerPerformance } from './ledger-performance';
import type { LedgerTransaction, KlinePoint } from '../../shared/types';
const row = (p: Partial<LedgerTransaction>): LedgerTransaction => ({
  id: crypto.randomUUID(),
  account: 'a',
  symbol: 'A',
  currency: 'USD',
  kind: 'deposit',
  date: '2026-01-01',
  shares: 0,
  price: 0,
  amount: 100,
  fees: 0,
  note: '',
  ...p,
});
const bar = (date: string, close: number): KlinePoint => ({
  time: Date.parse(date) / 1000,
  open: close,
  close,
  high: close,
  low: close,
  volume: 10,
});
describe('cashflow-aware performance', () => {
  it('additional deposits do not masquerade as investment return', () => {
    const r = ledgerPerformance([row({}), row({ date: '2026-01-02' })], {});
    expect(r[1].equity).toBe(200);
    expect(r[1].twr).toBe(0);
  });
  it('measures security gains independently of additional cash', () => {
    const r = ledgerPerformance(
      [
        row({}),
        row({ kind: 'buy', shares: 1, price: 100, amount: 0 }),
        row({ date: '2026-01-02' }),
      ],
      { A: [bar('2026-01-01', 100), bar('2026-01-02', 110)] },
    );
    expect(r[1].equity).toBe(210);
    expect(r[1].twr).toBeCloseTo(0.1);
  });
  it('missing historical prices do not produce a zero-value loss', () => {
    const r = ledgerPerformance(
      [row({}), row({ kind: 'buy', shares: 1, price: 100, amount: 0 })],
      {},
    );
    expect(r[0].equity).toBeNull();
    expect(r[0].twr).toBeNull();
  });
});
