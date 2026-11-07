import { useState } from 'react';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useQuotes } from '../../hooks/useQuotes';
import { useLanguage } from '../../hooks/useLanguage';
import { computeLedger } from '../../lib/research-ledger';
import { concentration, priceCorrelation } from '../../lib/portfolio-risk';
import { fetchKline } from '../../lib/ipc';
import type { KlinePoint } from '../../../shared/types';
import { buttonClass, type WorkspaceProps } from './common';
export default function RiskTab({ state, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const { overview } = usePortfolio();
  const accounts = computeLedger(state.ledger);
  const symbols = [
    ...new Set(
      accounts.flatMap((a) => a.positions.filter((p) => p.shares > 0).map((p) => p.symbol)),
    ),
  ];
  const { quotes } = useQuotes(symbols);
  const [correlations, setCorrelations] = useState<
    { a: string; b: string; value: number | null }[]
  >([]);
  const groups = accounts.map((a) => ({
    key: `${a.account}:${a.currency}`,
    positions: a.positions
      .filter((p) => p.shares > 0)
      .map((p) => ({
        symbol: p.symbol,
        value:
          quotes[p.symbol]?.currency === a.currency ? p.shares * quotes[p.symbol].price : undefined,
      })),
  }));
  for (const s of overview.summaries)
    groups.push({
      key: `${t('holdings_open')}:${s.currency}`,
      positions: overview.valuations
        .filter((v) => v.quote?.currency === s.currency)
        .map((v) => ({ symbol: v.position.symbol, value: v.marketValue })),
    });
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const result = concentration(
          g.positions.filter((p): p is { symbol: string; value: number } => p.value !== undefined),
        );
        return (
          <article key={g.key} className="p-4 border border-white/10 rounded-xl">
            <p>
              {g.key} · {t('research_concentration')}: {(result.largest * 100).toFixed(1)}% · HHI{' '}
              {result.hhi.toFixed(3)}
            </p>
            {g.positions
              .filter((p) => p.value === undefined)
              .map((p) => (
                <p className="text-amber-400" key={p.symbol}>
                  {p.symbol}: —
                </p>
              ))}
            {result.weights.map((p) => (
              <p className="text-xs mt-2" key={p.symbol}>
                {p.symbol} · {(p.weight * 100).toFixed(1)}%
              </p>
            ))}
          </article>
        );
      })}
      <button
        className={buttonClass}
        onClick={() =>
          run(async () => {
            const history: Record<string, KlinePoint[]> = {};
            const all = [...new Set(groups.flatMap((g) => g.positions.map((p) => p.symbol)))];
            for (let i = 0; i < all.length; i += 4)
              await Promise.all(
                all.slice(i, i + 4).map(async (symbol) => {
                  history[symbol] = await fetchKline({ symbol, period: '1d', range: '1y' }).catch(
                    () => [],
                  );
                }),
              );
            const rows = [];
            for (let i = 0; i < all.length; i++)
              for (let j = i + 1; j < all.length; j++)
                rows.push({
                  a: all[i],
                  b: all[j],
                  value: priceCorrelation(history[all[i]], history[all[j]]),
                });
            setCorrelations(rows);
          })
        }
      >
        {t('research_correlation')}
      </button>
      {correlations.map((r) => (
        <p className="text-sm" key={`${r.a}:${r.b}`}>
          {r.a} / {r.b}: {r.value?.toFixed(3) ?? '—'}
        </p>
      ))}
    </div>
  );
}
