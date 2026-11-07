import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import type { ResearchNote } from '../../../shared/types';
import { Field, inputClass, buttonClass, type WorkspaceProps } from './common';
export default function NotesTab({ state, symbol, change, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [thesis, setThesis] = useState(''),
    [counter, setCounter] = useState(''),
    [date, setDate] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const notes = state.notes.filter((n) => n.symbol === symbol);
  const save = () =>
    run(async () => {
      if (!thesis.trim()) throw new Error('Empty thesis');
      const old = notes.find((n) => n.id === editing);
      const history = state.snapshots[symbol] ?? [];
      const note: ResearchNote = {
        id: editing ?? crypto.randomUUID(),
        symbol,
        thesis: thesis.trim(),
        counterEvidence: counter,
        reviewDate: date,
        status: old?.status ?? 'open',
        analysisId: old?.analysisId ?? history[history.length - 1]?.deep?.analysisId,
        createdAt: old?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await change((s) => ({ ...s, notes: [note, ...s.notes.filter((n) => n.id !== note.id)] }));
      setEditing(null);
      setThesis('');
      setCounter('');
      setDate('');
    });
  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <Field label={t('research_thesis')}>
          <textarea
            className={inputClass}
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
          />
        </Field>
        <Field label={t('research_counter')}>
          <textarea
            className={inputClass}
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
          />
        </Field>
        <Field label={t('research_review')}>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <button className={buttonClass} onClick={save}>
          {t('research_save')}
        </button>
      </div>
      {!notes.length && <p>{t('research_empty')}</p>}
      {notes.map((n) => (
        <article key={n.id} className="p-4 rounded-xl border border-white/10 space-y-2">
          <button
            className="text-left whitespace-pre-wrap"
            onClick={() => {
              setEditing(n.id);
              setThesis(n.thesis);
              setCounter(n.counterEvidence);
              setDate(n.reviewDate);
            }}
          >
            {n.thesis}
          </button>
          <p className="text-sm text-gray-400 whitespace-pre-wrap">{n.counterEvidence}</p>
          <p className="text-xs">
            {n.reviewDate} · {n.analysisId}
          </p>
          <div className="flex gap-2">
            <select
              className={inputClass}
              value={n.status}
              onChange={(e) =>
                run(() =>
                  change((s) => ({
                    ...s,
                    notes: s.notes.map((x) =>
                      x.id === n.id
                        ? {
                            ...x,
                            status: e.target.value as ResearchNote['status'],
                            updatedAt: Date.now(),
                          }
                        : x,
                    ),
                  })),
                )
              }
            >
              {(['open', 'confirmed', 'invalidated'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`research_${v}`)}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                run(() => change((s) => ({ ...s, notes: s.notes.filter((x) => x.id !== n.id) })))
              }
            >
              {t('research_delete')}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
