import type { LedgerTransaction } from '../../shared/types';

export interface LedgerPosition {
  symbol: string;
  shares: number;
  cost: number;
  realized: number;
  dividends: number;
}
export interface LedgerAccount {
  account: string;
  currency: string;
  cash: number;
  fees: number;
  positions: LedgerPosition[];
}
/** 按日期与输入顺序重放流水；卖出释放平均成本，买入费用进入成本。 */
export function computeLedger(transactions: LedgerTransaction[]): LedgerAccount[] {
  const accounts = new Map<string, LedgerAccount>();
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (
      !t.id ||
      !t.account.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      !Number.isFinite(Date.parse(t.date)) ||
      new Date(t.date).toISOString().slice(0, 10) !== t.date ||
      !['CNY', 'USD'].includes(t.currency) ||
      !['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'split'].includes(t.kind) ||
      [t.shares, t.price, t.amount, t.fees].some((v) => !Number.isFinite(v) || v < 0)
    )
      throw new Error('Invalid transaction');
    const key = `${t.account}:${t.currency}`;
    const account = accounts.get(key) ?? {
      account: t.account,
      currency: t.currency,
      cash: 0,
      fees: 0,
      positions: [],
    };
    accounts.set(key, account);
    if (['buy', 'sell', 'split', 'dividend'].includes(t.kind) && !t.symbol.trim())
      throw new Error('Missing symbol');
    let p = account.positions.find((p) => p.symbol === t.symbol);
    if (!p && t.symbol) {
      p = { symbol: t.symbol, shares: 0, cost: 0, realized: 0, dividends: 0 };
      account.positions.push(p);
    }
    const value = t.shares * t.price;
    if (t.kind === 'buy') {
      if (!p || t.shares <= 0 || t.price <= 0) throw new Error('Invalid buy');
      p.shares += t.shares;
      p.cost += value + t.fees;
      account.cash -= value + t.fees;
    }
    if (t.kind === 'sell') {
      if (!p || t.shares <= 0 || t.price <= 0 || t.shares > p.shares + 1e-9)
        throw new Error('Sell exceeds holdings');
      const basis = (p.cost * t.shares) / p.shares;
      p.shares = Math.max(0, p.shares - t.shares);
      p.cost = Math.max(0, p.cost - basis);
      p.realized += value - t.fees - basis;
      account.cash += value - t.fees;
    }
    if (t.kind === 'split') {
      if (!p || t.shares <= 0) throw new Error('Invalid split ratio');
      p.shares *= t.shares;
    }
    if (t.kind === 'dividend' && p) {
      p.dividends += t.amount - t.fees;
      account.cash += t.amount - t.fees;
    }
    if (t.kind === 'deposit') account.cash += t.amount - t.fees;
    if (t.kind === 'withdrawal' || t.kind === 'fee') account.cash -= t.amount + t.fees;
    account.fees += t.fees + (t.kind === 'fee' ? t.amount : 0);
  }
  return [...accounts.values()];
}
export function ledgerCsv(rows: LedgerTransaction[]): string {
  const keys: (keyof LedgerTransaction)[] = [
    'id',
    'account',
    'symbol',
    'currency',
    'kind',
    'date',
    'shares',
    'price',
    'amount',
    'fees',
    'note',
  ];
  const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}
/** 支持引号、逗号、换行和 UTF-8 BOM；导入后先重放校验，禁止部分导入。 */
export function parseLedgerCsv(text: string): LedgerTransaction[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  const required = [
    'account',
    'symbol',
    'currency',
    'kind',
    'date',
    'shares',
    'price',
    'amount',
    'fees',
    'note',
  ];
  if (required.some((k) => !headers.includes(k))) throw new Error('Invalid CSV headers');
  const result = rows.map((cells) => {
    const obj = Object.fromEntries(headers.map((k, i) => [k, cells[i] ?? ''])) as Record<
      string,
      unknown
    >;
    for (const k of ['shares', 'price', 'amount', 'fees']) obj[k] = Number(obj[k]);
    obj.id ||= crypto.randomUUID();
    return obj as unknown as LedgerTransaction;
  });
  if (new Set(result.map((t) => t.id)).size !== result.length)
    throw new Error('Duplicate transaction ID');
  computeLedger(result);
  return result;
}
