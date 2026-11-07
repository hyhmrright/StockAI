import { isTauri } from '@tauri-apps/api/core';
import { getDb } from './db';
import { getStore } from './store';
import { readWorkspace, updateWorkspace, emptyWorkspace } from './research-store';
import { computeLedger } from './research-ledger';
import type { ResearchWorkspace } from '../../shared/types';
const TABLES = {
  analysis_records: [
    'symbol',
    'analyzed_at',
    'type',
    'result_json',
    'stock_info_json',
    'news_json',
    'analysis_key',
    'metadata_json',
  ],
  master_signals: [
    'master_id',
    'symbol',
    'signal',
    'confidence',
    'price_at',
    'recorded_at',
    'analysis_key',
    'model_fingerprint',
  ],
  positions: ['symbol', 'name', 'shares', 'cost_price', 'opened_at', 'note', 'updated_at'],
} as const;
type Tables = Record<keyof typeof TABLES, Record<string, unknown>[]>;
interface Backup {
  format: 'stockai-backup';
  version: 1;
  createdAt: number;
  workspace: ResearchWorkspace;
  tables: Tables;
  watchlist?: unknown;
  alerts?: unknown;
}
export function validateBackup(input: unknown): Backup {
  const b = input as Backup;
  if (
    !b ||
    b.format !== 'stockai-backup' ||
    b.version !== 1 ||
    !b.workspace ||
    b.workspace.version !== 1 ||
    !b.tables
  )
    throw new Error('Unsupported backup');
  for (const key of ['notes', 'ledger', 'documents', 'events', 'peers', 'savedScreens'] as const)
    if (!Array.isArray(b.workspace[key])) throw new Error('Invalid workspace');
  if (
    !b.workspace.snapshots ||
    typeof b.workspace.snapshots !== 'object' ||
    Array.isArray(b.workspace.snapshots)
  )
    throw new Error('Invalid snapshots');
  for (const group of ['notes', 'ledger', 'documents', 'events', 'savedScreens'] as const)
    if (b.workspace[group].some((v) => !v || typeof v.id !== 'string'))
      throw new Error('Invalid record');
  for (const note of b.workspace.notes)
    if (
      typeof note.symbol !== 'string' ||
      typeof note.thesis !== 'string' ||
      typeof note.counterEvidence !== 'string'
    )
      throw new Error('Invalid note');
  for (const doc of b.workspace.documents)
    if (
      typeof doc.symbol !== 'string' ||
      typeof doc.title !== 'string' ||
      !Array.isArray(doc.chunks) ||
      doc.chunks.some((c) => typeof c.text !== 'string')
    )
      throw new Error('Invalid document');
  for (const key of Object.keys(TABLES) as (keyof Tables)[]) {
    if (!Array.isArray(b.tables[key])) throw new Error('Invalid table');
    for (const row of b.tables[key]) {
      for (const col of ['analysis_key', 'metadata_json', 'model_fingerprint'])
        if ((TABLES[key] as readonly string[]).includes(col) && !(col in row)) row[col] = null;
    }
    for (const row of b.tables[key])
      for (const col of TABLES[key])
        if (!(col in row) || (row[col] !== null && !['string', 'number'].includes(typeof row[col])))
          throw new Error('Invalid row');
  }
  for (const [symbol, rows] of Object.entries(b.workspace.snapshots)) {
    if (
      !symbol ||
      !Array.isArray(rows) ||
      rows.some(
        (r) =>
          !r || r.symbol !== symbol || !Number.isFinite(r.capturedAt) || !Array.isArray(r.news),
      )
    )
      throw new Error('Invalid snapshots');
  }
  if (b.workspace.peers.some((v) => typeof v !== 'string')) throw new Error('Invalid peers');
  if (
    b.workspace.events.some(
      (e) =>
        typeof e.symbol !== 'string' ||
        typeof e.title !== 'string' ||
        typeof e.date !== 'string' ||
        typeof e.read !== 'boolean',
    )
  )
    throw new Error('Invalid events');
  if (
    b.workspace.savedScreens.some((s) => typeof s.title !== 'string' || typeof s.query !== 'string')
  )
    throw new Error('Invalid saved query');
  if (
    b.workspace.pricing &&
    Object.values(b.workspace.pricing).some(
      (p) =>
        !p || ![p.inputPerMillion, p.outputPerMillion].every((v) => Number.isFinite(v) && v >= 0),
    )
  )
    throw new Error('Invalid pricing');
  computeLedger(b.workspace.ledger);
  // 只复制白名单字段，配置与密钥即使夹带也不会被恢复。
  return {
    format: b.format,
    version: 1,
    createdAt: b.createdAt,
    workspace: {
      pricing: b.workspace.pricing,
      version: 1,
      notes: b.workspace.notes,
      ledger: b.workspace.ledger,
      documents: b.workspace.documents,
      snapshots: b.workspace.snapshots,
      events: b.workspace.events,
      peers: b.workspace.peers,
      savedScreens: b.workspace.savedScreens,
    },
    tables: b.tables,
    watchlist: b.watchlist,
    alerts: b.alerts,
  };
}
export async function createBackup(): Promise<Backup> {
  const tables: Tables = { analysis_records: [], master_signals: [], positions: [] };
  let watchlist: unknown, alerts: unknown;
  if (isTauri()) {
    const db = await getDb();
    for (const key of Object.keys(TABLES) as (keyof Tables)[])
      tables[key] = await db.select(`SELECT ${TABLES[key].join(',')} FROM ${key}`);
    const store = await getStore();
    watchlist = await store.get('watchlist');
    alerts = await store.get('price_alerts');
  }
  return {
    format: 'stockai-backup',
    version: 1,
    createdAt: Date.now(),
    workspace: await readWorkspace(),
    tables,
    watchlist,
    alerts,
  };
}
/** 合并恢复可重试且不覆盖已有持仓；每张表用单条 SQL，失败保留完整备份供重试。 */
export async function restoreBackup(input: unknown) {
  const backup = validateBackup(input);
  const before = await readWorkspace();
  const ids = new Set(before.ledger.map((t) => t.id));
  computeLedger([...before.ledger, ...backup.workspace.ledger.filter((t) => !ids.has(t.id))]);
  if (isTauri()) {
    const db = await getDb();
    for (const key of Object.keys(TABLES) as (keyof Tables)[]) {
      const cols = TABLES[key];
      for (const row of backup.tables[key]) {
        const params = cols.map((c) => row[c]);
        const same = cols.map((c, i) => `${c} IS $${i + 1}`).join(' AND ');
        await db.execute(
          `INSERT OR IGNORE INTO ${key} (${cols.join(',')}) SELECT ${cols.map((_, i) => `$${i + 1}`).join(',')} WHERE NOT EXISTS (SELECT 1 FROM ${key} WHERE ${same})`,
          params,
        );
      }
    }
    const store = await getStore();
    if (Array.isArray(backup.watchlist)) {
      const current = (await store.get<{ sym: string }[]>('watchlist')) ?? [];
      const incoming = backup.watchlist.filter(
        (x): x is { sym: string; name: string } =>
          !!x && typeof x.sym === 'string' && typeof x.name === 'string',
      );
      await store.set('watchlist', [
        ...current,
        ...incoming.filter((x) => !current.some((c) => c.sym === x.sym)),
      ]);
    }
    if (backup.alerts && typeof backup.alerts === 'object')
      await store.set('price_alerts', {
        ...Object.fromEntries(
          Object.entries(backup.alerts).filter(
            ([, v]) =>
              v &&
              typeof v === 'object' &&
              typeof (v as { symbol?: unknown }).symbol === 'string' &&
              typeof (v as { enabled?: unknown }).enabled === 'boolean' &&
              ['upperLimit', 'lowerLimit'].every(
                (k) =>
                  (v as Record<string, unknown>)[k] === undefined ||
                  (typeof (v as Record<string, unknown>)[k] === 'number' &&
                    Number.isFinite((v as Record<string, number>)[k])),
              ),
          ),
        ),
        ...((await store.get('price_alerts')) as object),
      });
    await store.save();
  }
  await updateWorkspace((current) => {
    const merged = { ...emptyWorkspace(), ...current };
    for (const k of ['notes', 'ledger', 'documents', 'events', 'savedScreens'] as const) {
      const existing = new Set(current[k].map((x) => x.id));
      (merged[k] as { id: string }[]) = [
        ...current[k],
        ...backup.workspace[k].filter((x) => !existing.has(x.id)),
      ];
    }
    computeLedger(merged.ledger);
    merged.pricing = { ...backup.workspace.pricing, ...current.pricing };
    merged.peers = [...new Set([...current.peers, ...backup.workspace.peers])];
    merged.snapshots = { ...current.snapshots };
    for (const [symbol, rows] of Object.entries(backup.workspace.snapshots)) {
      if (!Array.isArray(rows)) throw new Error('Invalid snapshot history');
      const existing = current.snapshots[symbol] ?? [];
      merged.snapshots[symbol] = [
        ...existing,
        ...rows.filter((r) => !existing.some((e) => e.capturedAt === r.capturedAt)),
      ]
        .sort((a, b) => a.capturedAt - b.capturedAt)
        .slice(-200);
    }
    return merged;
  });
}
