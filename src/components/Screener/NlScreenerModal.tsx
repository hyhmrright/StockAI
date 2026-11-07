import { useScreenWorkbench } from '../../hooks/useScreenWorkbench';
import { X } from 'lucide-react';
import { prepareScreen } from '../../lib/ipc';
import { updateWorkspace, readWorkspace } from '../../lib/research-store';
import { inputClass, buttonClass } from '../Research/common';
import NlScreenerTable from './NlScreenerTable';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
}
/** 先解析与编辑，再执行；继续扫描固定查询与同一份市场快照。 */
export default function NlScreenerModal({ isOpen, onClose, onSelect }: Props) {
  const {
    t,
    text,
    setText,
    editor,
    setEditor,
    response,
    setResponse,
    busy,
    setBusy,
    error,
    epoch,
    run,
    execute,
  } = useScreenWorkbench();
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <section
        role="dialog"
        aria-label={t('screener_title')}
        className="bg-panel border border-white/10 rounded-2xl p-5 max-w-3xl w-full max-h-[88vh] overflow-y-auto space-y-4"
      >
        <header className="flex justify-between">
          <h2>{t('screener_title')}</h2>
          <button
            aria-label={t('close')}
            onClick={() => {
              epoch.current++;
              setBusy(false);
              onClose();
            }}
          >
            <X />
          </button>
        </header>
        <p className="text-xs text-gray-400">{t('screener_a_share_only')}</p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder={t('screener_input_placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className={buttonClass}
            disabled={busy || !text.trim()}
            onClick={() =>
              run(async (id) => {
                const result = await prepareScreen(text);
                if (id === epoch.current) {
                  setEditor(JSON.stringify(result.query, null, 2));
                  setResponse(null);
                }
              })
            }
          >
            {t('screener_understood_as')}
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() =>
              run(async () => {
                await updateWorkspace((s) => ({
                  ...s,
                  savedScreens: [
                    ...s.savedScreens,
                    { id: crypto.randomUUID(), title: text || 'Screen', query: editor },
                  ],
                }));
              })
            }
            disabled={!editor}
          >
            {t('research_save')}
          </button>
          <button
            onClick={() =>
              run(async () => {
                const s = await readWorkspace();
                const saved = s.savedScreens[s.savedScreens.length - 1];
                if (saved) {
                  setText(saved.title);
                  setEditor(saved.query);
                  setResponse(null);
                }
              })
            }
          >
            {t('research_import')}
          </button>
        </div>
        {editor && (
          <>
            <label className="block text-xs text-gray-400">
              {t('research_screen_edit')}
              <textarea
                rows={8}
                className={`${inputClass} font-mono mt-2`}
                value={editor}
                onChange={(e) => {
                  setEditor(e.target.value);
                  setResponse(null);
                }}
              />
            </label>
            <button className={buttonClass} disabled={busy} onClick={() => execute()}>
              {busy ? t('screener_running') : t('research_run')}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="text-rose-400">
            {error}
          </p>
        )}
        {response && (
          <>
            <p className="text-xs text-gray-400">
              {t('research_coverage', {
                attempted: response.coverage?.attempted ?? response.refinedCount,
                total: response.scannedCoarse,
                failed: response.coverage?.failed ?? 0,
              })}{' '}
              · {t('research_source_date')}: {new Date(response.fetchedAt).toLocaleString()}
            </p>
            <p className="text-xs text-amber-300">
              {t(response.coverage?.complete ? 'research_complete' : 'research_partial')}
            </p>
            <NlScreenerTable
              matches={response.matches}
              onSelect={(symbol) => {
                onSelect(symbol);
                onClose();
              }}
            />
            {response.nextOffset != null && (
              <button className={buttonClass} disabled={busy} onClick={() => execute(true)}>
                {t('research_scan_more')}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
