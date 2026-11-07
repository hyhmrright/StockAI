import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { fetchQuantBundle } from '../../lib/ipc';
import type { QuantBundle } from '../../../shared/types';
import { inputClass, buttonClass, type WorkspaceProps } from './common';
export default function PeersTab({ state, symbol, change, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState(state.peers.join(',') || symbol);
  const [results, setResults] = useState<{ symbol: string; quant?: QuantBundle }[]>([]),
    [busy, setBusy] = useState(false);
  const load = () =>
    run(async () => {
      const symbols = [
        ...new Set(
          input
            .toUpperCase()
            .split(/[,，\s]+/)
            .filter(Boolean),
        ),
      ];
      if (symbols.length < 2 || symbols.length > 5) throw new Error('Choose 2–5 symbols');
      setBusy(true);
      try {
        await change((s) => ({ ...s, peers: symbols }));
        const data = await Promise.all(
          symbols.map(async (symbol) => ({
            symbol,
            quant: await fetchQuantBundle(symbol).catch(() => undefined),
          })),
        );
        setResults(data);
      } finally {
        setBusy(false);
      }
    });
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{t('research_peers_hint')}</p>
      <div className="flex gap-2">
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={busy} className={buttonClass} onClick={load}>
          {t('research_refresh')}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                'research_symbol',
                'research_score',
                'research_technical',
                'research_fundamental',
                'research_valuation',
                'research_risk',
              ].map((k) => (
                <th className="p-2 text-left" key={k}>
                  {t(k as 'research_symbol')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map(({ symbol, quant: q }) => (
              <tr key={symbol} className="border-b border-white/10">
                <td className="p-2">{symbol}</td>
                <td>{q?.composite.score ?? '—'}</td>
                <td>{q?.technical.signal ?? '—'}</td>
                <td>{q?.fundamental.signal ?? '—'}</td>
                <td>{q?.valuation?.signal ?? '—'}</td>
                <td>{q?.risk?.riskLevel ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {results.map((r) => (
        <details key={r.symbol}>
          <summary>
            {r.symbol} ·{' '}
            {r.quant ? new Date(r.quant.fetchedAt).toLocaleString() : t('research_error')}
          </summary>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {r.quant?.fundamental.checks?.map((c) => (
              <p key={c.key}>
                {c.key}: {c.actual ?? '—'}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
