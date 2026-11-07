import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { computeLedger, ledgerCsv, parseLedgerCsv } from '../../lib/research-ledger';
import { downloadText } from '../../lib/download';
import type { LedgerTransaction, TransactionKind } from '../../../shared/types';
import { Field, inputClass, buttonClass, type WorkspaceProps } from './common';
export default function LedgerTab({ state, symbol, change, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Omit<LedgerTransaction, 'id'>>({
    account: 'default',
    symbol,
    currency: /\d{6}/.test(symbol) ? 'CNY' : 'USD',
    kind: 'buy',
    date: new Date().toISOString().slice(0, 10),
    shares: 0,
    price: 0,
    amount: 0,
    fees: 0,
    note: '',
  });
  const accounts = computeLedger(state.ledger);
  const save = () =>
    run(async () => {
      const item = { ...draft, id: crypto.randomUUID(), symbol: draft.symbol.trim().toUpperCase() };
      await change((s) => {
        const ledger = [...s.ledger, item];
        computeLedger(ledger);
        return { ...s, ledger };
      });
    });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        {(['account', 'symbol', 'date'] as const).map((k) => (
          <Field key={k} label={t(`research_${k}`)}>
            <input
              type={k === 'date' ? 'date' : 'text'}
              className={inputClass}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          </Field>
        ))}
        <Field label={t('research_kind')}>
          <select
            className={inputClass}
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as TransactionKind })}
          >
            {(['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'split'] as const).map(
              (k) => (
                <option key={k} value={k}>
                  {t(`research_${k}`)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={t('research_currency')}>
          <select
            className={inputClass}
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value as 'CNY' | 'USD' })}
          >
            <option>CNY</option>
            <option>USD</option>
          </select>
        </Field>
        {(['shares', 'price', 'amount', 'fees'] as const).map((k) => (
          <Field key={k} label={t(`research_${k}`)}>
            <input
              type="number"
              min="0"
              step="any"
              className={inputClass}
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
            />
          </Field>
        ))}
        <Field label={t('research_note')}>
          <input
            className={inputClass}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex gap-3">
        <button className={buttonClass} onClick={save}>
          {t('research_save')}
        </button>
        <button
          onClick={() =>
            downloadText(
              'stockai-transactions.csv',
              ledgerCsv(state.ledger),
              'text/csv;charset=utf-8',
            )
          }
        >
          {t('research_export')} CSV
        </button>
        <label className={buttonClass}>
          {t('research_import')} CSV
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                run(async () => {
                  const incoming = parseLedgerCsv(await f.text());
                  await change((s) => {
                    const ids = new Set(s.ledger.map((x) => x.id));
                    const ledger = [...s.ledger, ...incoming.filter((x) => !ids.has(x.id))];
                    computeLedger(ledger);
                    return { ...s, ledger };
                  });
                });
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {accounts.map((a) => (
        <article
          key={`${a.account}:${a.currency}`}
          className="p-4 border border-white/10 rounded-xl"
        >
          <p>
            {a.account} · {a.currency} · {t('research_cash')}: {a.cash.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">
            {t('research_fees')}: {a.fees.toFixed(2)}
          </p>
          {a.positions.map((p) => (
            <p key={p.symbol} className="text-sm mt-2">
              {p.symbol} · {p.shares.toFixed(4)} · {t('research_realized')}: {p.realized.toFixed(2)}{' '}
              · {t('research_dividend')}: {p.dividends.toFixed(2)}
            </p>
          ))}
        </article>
      ))}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {[...state.ledger].reverse().map((row) => (
              <tr key={row.id} className="border-b border-white/10">
                <td className="p-2">{row.date}</td>
                <td>{row.account}</td>
                <td>{row.symbol}</td>
                <td>{t(`research_${row.kind}`)}</td>
                <td>{row.shares}</td>
                <td>{row.price}</td>
                <td>{row.amount}</td>
                <td>{row.fees}</td>
                <td>
                  <button
                    onClick={() =>
                      run(() =>
                        change((s) => {
                          const ledger = s.ledger.filter((x) => x.id !== row.id);
                          computeLedger(ledger);
                          return { ...s, ledger };
                        }),
                      )
                    }
                  >
                    {t('research_delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
