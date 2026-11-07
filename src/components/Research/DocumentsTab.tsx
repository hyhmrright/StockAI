import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { documentChunks, extractPdf } from '../../lib/research-documents';
import { fetchSecReports, fetchAnnouncements, fetchReportPdf } from '../../lib/ipc';
import { Field, inputClass, buttonClass, SourceLink, type WorkspaceProps } from './common';
export default function DocumentsTab({ state, symbol, change, run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(''),
    [date, setDate] = useState(''),
    [url, setUrl] = useState(''),
    [text, setText] = useState('');
  const [announcements, setAnnouncements] = useState<
    import('../../../shared/types').ResearchDocument[]
  >([]);
  const save = () =>
    run(async () => {
      if (!title.trim() || !text.trim() || !date) throw new Error('Missing document fields');
      const chunks = documentChunks(text, title, date, url);
      await change((s) => ({
        ...s,
        documents: [...s.documents, { id: crypto.randomUUID(), symbol, title, date, url, chunks }],
      }));
      setText('');
    });
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{t('research_document_hint')}</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={t('research_title')}>
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
        <Field label={t('research_url')}>
          <input
            type="url"
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t('research_text')}>
        <textarea
          rows={8}
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="flex gap-3">
        <button className={buttonClass} onClick={save}>
          {t('research_save')}
        </button>
        <label className={buttonClass}>
          {t('research_import')} PDF / TXT
          <input
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                run(async () => {
                  setText(
                    file.name.toLowerCase().endsWith('.pdf')
                      ? await extractPdf(file)
                      : await file.text(),
                  );
                  if (!title) setTitle(file.name);
                });
              e.target.value = '';
            }}
          />
        </label>
        {/\d{6}/.test(symbol) && (
          <button
            className={buttonClass}
            onClick={() => run(async () => setAnnouncements(await fetchAnnouncements(symbol)))}
          >
            {t('research_announcements')}
          </button>
        )}
        {!/\d{6}/.test(symbol) && (
          <button
            className={buttonClass}
            onClick={() =>
              run(async () => {
                const docs = await fetchSecReports(symbol);
                await change((s) => ({
                  ...s,
                  documents: [
                    ...s.documents,
                    ...docs.filter((d) => !s.documents.some((x) => x.id === d.id)),
                  ],
                }));
              })
            }
          >
            SEC 10-K / 10-Q
          </button>
        )}
      </div>
      {announcements.map((doc) => (
        <article key={doc.id} className="p-3 border border-white/10 rounded-xl">
          <SourceLink url={doc.url}>{doc.title}</SourceLink> · {doc.date}
          <button
            className="ml-3 text-emerald-400 text-xs"
            onClick={() =>
              run(async () => {
                const { base64 } = await fetchReportPdf(doc.url!);
                const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
                const extracted = await extractPdf(
                  new File([data], `${doc.id}.pdf`, { type: 'application/pdf' }),
                );
                await change((s) => ({
                  ...s,
                  documents: [
                    ...s.documents.filter((d) => d.id !== doc.id),
                    { ...doc, chunks: documentChunks(extracted, doc.title, doc.date, doc.url) },
                  ],
                }));
              })
            }
          >
            {t('research_import')}
          </button>
        </article>
      ))}
      {state.documents
        .filter((d) => d.symbol === symbol)
        .map((d) => (
          <details key={d.id} className="p-3 border border-white/10 rounded-xl">
            <summary>
              <SourceLink url={d.url}>{d.title}</SourceLink> · {d.date} · {d.chunks.length}
            </summary>
            <button
              className="text-xs text-rose-400 my-2"
              onClick={() =>
                run(() =>
                  change((s) => ({ ...s, documents: s.documents.filter((x) => x.id !== d.id) })),
                )
              }
            >
              {t('research_delete')}
            </button>
            {d.chunks.map((c, i) => (
              <p className="text-xs text-gray-400 whitespace-pre-wrap my-3" key={i}>
                {c.position} — {c.text}
              </p>
            ))}
          </details>
        ))}
    </div>
  );
}
