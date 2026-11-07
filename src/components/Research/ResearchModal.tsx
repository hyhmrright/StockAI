import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useResearchWorkspace } from '../../hooks/useResearchWorkspace';
import PerformanceTab from './PerformanceTab';
import MastersTab from './MastersTab';
import RiskTab from './RiskTab';
import TasksTab from './TasksTab';
import NotesTab from './NotesTab';
import ChangesTab from './ChangesTab';
import EventsTab from './EventsTab';
import LedgerTab from './LedgerTab';
import PeersTab from './PeersTab';
import DocumentsTab from './DocumentsTab';
import BackupTab from './BackupTab';
const tabs = {
  performance: PerformanceTab,
  masters: MastersTab,
  risk: RiskTab,
  tasks: TasksTab,
  notes: NotesTab,
  changes: ChangesTab,
  events: EventsTab,
  ledger: LedgerTab,
  peers: PeersTab,
  documents: DocumentsTab,
  backup: BackupTab,
};
export default function ResearchModal({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { state, change, error, loading } = useResearchWorkspace();
  const [tab, setTab] = useState<keyof typeof tabs>('notes'),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const run = (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setStatus('');
    void task()
      .then(() => setStatus(t('research_saved')))
      .catch((error) => {
        console.error('研究工作台操作失败', error);
        setStatus(t('research_error'));
      })
      .finally(() => setBusy(false));
  };
  const Panel = tabs[tab];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('workbench')}
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col"
      >
        <header className="p-5 flex justify-between border-b border-white/10">
          <h2 className="font-semibold">
            {t('workbench')} · {symbol}
          </h2>
          <button aria-label={t('close')} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <nav className="flex flex-wrap gap-2 p-3 border-b border-white/10">
          {(Object.keys(tabs) as (keyof typeof tabs)[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 rounded-lg whitespace-nowrap text-sm ${tab === key ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400'}`}
            >
              {t(`research_${key}`)}
            </button>
          ))}
        </nav>
        <div aria-live="polite" className="px-5 text-sm text-amber-300">
          {error ? t('research_error') : status}
        </div>
        <fieldset disabled={busy || loading} className="p-5 overflow-y-auto flex-1 min-h-0">
          <Panel key={`${tab}:${symbol}`} state={state} symbol={symbol} change={change} run={run} />
        </fieldset>
      </section>
    </div>
  );
}
