import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { compareResearch } from '../../lib/research-changes';
import { Field, inputClass, type WorkspaceProps } from './common';
export default function ChangesTab({ state, symbol }: WorkspaceProps) {
  const { t } = useLanguage();
  const rows = state.snapshots[symbol] ?? [];
  const [from, setFrom] = useState(-2),
    [to, setTo] = useState(-1);
  const index = (i: number) => (i < 0 ? rows.length + i : i);
  const after = rows[index(to)];
  const changes = after ? compareResearch(rows[index(from)], after) : [];
  const labels: Record<string, string> = {
    score: t('research_score'),
    technical: t('research_technical'),
    fundamental: t('research_fundamental'),
    valuation: t('research_valuation'),
    risk: t('research_risk'),
    news: t('research_news'),
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            [from, setFrom, 'research_before'],
            [to, setTo, 'research_after'],
          ] as const
        ).map(([value, set, label]) => (
          <Field key={label} label={t(label)}>
            <select
              className={inputClass}
              value={index(value)}
              onChange={(e) => set(Number(e.target.value))}
            >
              {rows.map((r, i) => (
                <option key={r.capturedAt} value={i}>
                  {new Date(r.capturedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      {!changes.length ? (
        <p>{t('research_no_changes')}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {changes.map((c, i) => (
              <tr key={i} className="border-b border-white/10">
                <td className="p-3">{labels[c.field] ?? c.field}</td>
                <td>{c.before}</td>
                <td className="p-3">{c.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500">
        {t('research_source_date')}:{' '}
        {after?.quant ? new Date(after.quant.fetchedAt).toLocaleString() : '—'}
      </p>
    </div>
  );
}
