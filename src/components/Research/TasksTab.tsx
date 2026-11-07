import ModelPricing from './ModelPricing';
import { useSyncExternalStore } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { taskSnapshot, subscribeTasks } from '../../lib/task-store';
import { cancelTask } from '../../lib/ipc';
import { buttonClass, type WorkspaceProps } from './common';
export default function TasksTab(props: WorkspaceProps) {
  const { run, state } = props;
  const { t } = useLanguage();
  const tasks = useSyncExternalStore(subscribeTasks, taskSnapshot);
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{t('research_cost_hint')}</p>
      <ModelPricing
        {...props}
        models={[
          ...new Set(
            tasks.flatMap((task) =>
              task.events.filter((e) => e.type === 'usage').map((e) => `${e.provider}:${e.model}`),
            ),
          ),
        ]}
      />
      {!tasks.length && <p>{t('research_empty')}</p>}
      {tasks.map((task) => (
        <article key={task.id} className="p-4 rounded-xl border border-white/10 space-y-2">
          <p>
            {task.label} · {task.status} ·{' '}
            {((task.finishedAt ?? Date.now()) - task.startedAt) / 1000}s
          </p>
          {task.status === 'running' && (
            <button className={buttonClass} onClick={() => run(() => cancelTask(task.id))}>
              {t('research_cancel')}
            </button>
          )}
          <p className="text-xs text-gray-400">
            {t('research_estimated_cost')}:{' '}
            {task.events.some((e) => e.type === 'usage') &&
            task.events
              .filter((e) => e.type === 'usage')
              .every((e) => state.pricing?.[`${e.provider}:${e.model}`])
              ? '$' +
                task.events
                  .reduce((sum, e) => {
                    if (e.type !== 'usage') return sum;
                    const price = state.pricing?.[`${e.provider}:${e.model}`];
                    return (
                      sum +
                      ((e.inputTokens ?? 0) * (price?.inputPerMillion ?? 0) +
                        (e.outputTokens ?? 0) * (price?.outputPerMillion ?? 0)) /
                        1000000
                    );
                  }, 0)
                  .toFixed(6)
              : '—'}
          </p>
          {task.events.map((e, i) =>
            e.type === 'master' ? (
              <details key={i}>
                <summary>
                  {e.master?.masterId} · {e.master?.signal} · {e.master?.confidence}
                </summary>
                <p className="text-sm text-gray-400">{e.master?.reasoning}</p>
              </details>
            ) : e.type === 'usage' ? (
              <p key={i} className="text-xs text-gray-400">
                {e.provider} / {e.model} · input {e.inputTokens ?? '—'} · output{' '}
                {e.outputTokens ?? '—'}
              </p>
            ) : e.phase === 'cache-hit' ? (
              <p key={i} className="text-xs text-emerald-400">
                {t('research_cache_hit')}
              </p>
            ) : null,
          )}
        </article>
      ))}
    </div>
  );
}
