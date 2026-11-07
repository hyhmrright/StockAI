import { refreshResearchEvents } from '../../lib/research-events';
import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { Field, inputClass, buttonClass, SourceLink, type WorkspaceProps } from './common';
export default function EventsTab({ state, symbol, change, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(''),
    [date, setDate] = useState('');
  const reviews = state.notes
    .filter((n) => n.reviewDate && n.status === 'open')
    .map((n) => ({
      id: `review:${n.id}`,
      symbol: n.symbol,
      title: n.thesis,
      date: n.reviewDate,
      read: false,
      kind: 'review' as const,
    }));
  const events = [...reviews, ...state.events].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-2">
        <Field label={t('research_event_title')}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('research_date')}>
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <button
          className={buttonClass}
          disabled={!title.trim() || !date}
          onClick={() =>
            run(async () => {
              await change((s) => ({
                ...s,
                events: [
                  { id: crypto.randomUUID(), symbol, title, date, read: false, kind: 'calendar' },
                  ...s.events,
                ],
              }));
              setTitle('');
            })
          }
        >
          {t('research_save')}
        </button>
      </div>
      <button className={buttonClass} onClick={() => run(refreshResearchEvents)}>
        {t('research_refresh_watchlist')}
      </button>
      {!events.length && <p>{t('research_empty')}</p>}
      {events.map((e) => (
        <article
          key={e.id}
          className={`p-3 rounded-xl border border-white/10 ${e.read ? 'opacity-50' : ''}`}
        >
          <div className="text-xs text-gray-400">
            {e.symbol} · {e.date} · {e.kind}
          </div>
          <SourceLink url={'url' in e ? e.url : undefined}>{e.title}</SourceLink>
          {e.kind !== 'review' && !e.read && (
            <button
              className="block text-xs mt-2 text-emerald-400"
              onClick={() =>
                run(() =>
                  change((s) => ({
                    ...s,
                    events: s.events.map((x) => (x.id === e.id ? { ...x, read: true } : x)),
                  })),
                )
              }
            >
              {t('research_mark_read')}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
