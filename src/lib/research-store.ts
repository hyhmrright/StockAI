import { isTauri } from '@tauri-apps/api/core';
import { getDb } from './db';
import type { ResearchWorkspace } from '../../shared/types';

export const emptyWorkspace = (): ResearchWorkspace => ({
  version: 1,
  notes: [],
  ledger: [],
  documents: [],
  snapshots: {},
  events: [],
  peers: [],
  savedScreens: [],
});
let pending: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export const subscribeWorkspace = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export async function readWorkspace(): Promise<ResearchWorkspace> {
  let raw: string | null = null;
  if (isTauri()) {
    const rows = await (await getDb()).select<{ value: string }[]>(
      'SELECT value FROM workspace_records WHERE key = $1',
      ['research'],
    );
    raw = rows[0]?.value ?? null;
  } else raw = localStorage.getItem('stockai-research');
  return raw ? (JSON.parse(raw) as ResearchWorkspace) : emptyWorkspace();
}
/** 所有写入串行化，防止事件捕获与用户编辑互相覆盖；失败不污染后续队列。 */
export function updateWorkspace(
  change: (state: ResearchWorkspace) => ResearchWorkspace,
): Promise<void> {
  const job = pending.then(async () => {
    const state = change(await readWorkspace());
    const raw = JSON.stringify(state);
    if (isTauri())
      await (await getDb()).execute(
        'INSERT INTO workspace_records (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
        ['research', raw, Date.now()],
      );
    else localStorage.setItem('stockai-research', raw);
    listeners.forEach((fn) => fn());
  });
  pending = job.catch(() => {});
  return job;
}
