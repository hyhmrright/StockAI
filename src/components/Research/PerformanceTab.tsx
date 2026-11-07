import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { ledgerPerformance } from '../../lib/ledger-performance';
import { fetchKline } from '../../lib/ipc';
import { downloadText } from '../../lib/download';
import type { KlinePoint } from '../../../shared/types';
import { inputClass, buttonClass, type WorkspaceProps } from './common';
export default function PerformanceTab({ state, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const keys = [...new Set(state.ledger.map((x) => `${x.account}:${x.currency}`))];
  const [selected, setSelected] = useState(keys[0] ?? ''),
    [curve, setCurve] = useState<ReturnType<typeof ledgerPerformance>>([]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{t('research_performance_rules')}</p>
      <div className="flex gap-3">
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setCurve([]);
          }}
        >
          {keys.map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
        <button
          className={buttonClass}
          onClick={() =>
            run(async () => {
              const rows = state.ledger.filter((x) => `${x.account}:${x.currency}` === selected);
              const symbols = [
                ...new Set(
                  rows
                    .filter((x) => ['buy', 'sell', 'split'].includes(x.kind))
                    .map((x) => x.symbol),
                ),
              ];
              const history: Record<string, KlinePoint[]> = {};
              for (let i = 0; i < symbols.length; i += 4)
                await Promise.all(
                  symbols.slice(i, i + 4).map(async (symbol) => {
                    history[symbol] = await fetchKline({
                      symbol,
                      period: '1d',
                      range: 'all',
                      adjust: 'none',
                    });
                  }),
                );
              setCurve(ledgerPerformance(rows, history));
            })
          }
        >
          {t('research_run')}
        </button>
        <button
          onClick={() => downloadText('stockai-performance.json', JSON.stringify(curve, null, 2))}
        >
          {t('research_export')}
        </button>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('research_date')}</th>
              <th>{t('research_equity')}</th>
              <th>TWR</th>
            </tr>
          </thead>
          <tbody>
            {curve.map((p) => (
              <tr key={p.date}>
                <td className="p-2">{p.date}</td>
                <td>{p.equity?.toFixed(2) ?? '—'}</td>
                <td>{p.twr !== null ? `${(p.twr * 100).toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
