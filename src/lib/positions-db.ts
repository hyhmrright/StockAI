import { isTauri } from '@tauri-apps/api/core';
import { getDb } from './db';
import { mergeCost } from './portfolio';
import type { Position, PositionInput } from '../../shared/types';

/**
 * 用户持仓的读写。与 db.ts 的分析历史共用同一条连接（见 getDb 的注释），
 * 但属于不同领域，故单独成文件。
 *
 * 与 db.ts 一致：非 Tauri（浏览器 dev）环境下全部退化为空操作——
 * 那里没有 SQLite，报错只会刷屏。
 */

interface RawPositionRow {
  id: number;
  symbol: string;
  name: string | null;
  shares: number;
  cost_price: number;
  opened_at: number;
  note: string | null;
}

function rowToPosition(r: RawPositionRow): Position {
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name ?? undefined,
    shares: r.shares,
    costPrice: r.cost_price,
    openedAt: r.opened_at,
    note: r.note ?? undefined,
  };
}

const SELECT_ALL = `SELECT id, symbol, name, shares, cost_price, opened_at, note
   FROM positions ORDER BY opened_at ASC`;

export async function getPositions(): Promise<Position[]> {
  if (!isTauri()) return [];
  const rows = await (await getDb()).select<RawPositionRow[]>(SELECT_ALL);
  return rows.map(rowToPosition);
}

/**
 * 建仓或加仓。symbol 在表上是 UNIQUE：已有同一标的时按份额加权合并成本，
 * 而不是插第二行——「同一只股票两行不同成本」在界面上无法解释，
 * 合并成一行加权均价才是用户心里的那个"我的成本"。
 *
 * 返回合并后的持仓，便于调用方直接更新本地状态。
 */
export async function upsertPosition(input: PositionInput): Promise<Position | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const now = Date.now();

  const existing = await db.select<RawPositionRow[]>(
    `SELECT id, symbol, name, shares, cost_price, opened_at, note
       FROM positions WHERE symbol = $1`,
    [input.symbol],
  );

  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO positions (symbol, name, shares, cost_price, opened_at, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.symbol,
        input.name ?? null,
        input.shares,
        input.costPrice,
        input.openedAt,
        input.note ?? null,
        now,
      ],
    );
  } else {
    const prev = rowToPosition(existing[0]);
    const merged = mergeCost(prev, input);
    await db.execute(
      `UPDATE positions SET name = $1, shares = $2, cost_price = $3, note = $4, updated_at = $5
       WHERE symbol = $6`,
      [
        input.name ?? prev.name ?? null,
        merged.shares,
        merged.costPrice,
        input.note ?? prev.note ?? null,
        now,
        input.symbol,
      ],
    );
  }

  const after = await db.select<RawPositionRow[]>(
    `SELECT id, symbol, name, shares, cost_price, opened_at, note
       FROM positions WHERE symbol = $1`,
    [input.symbol],
  );
  return after.length > 0 ? rowToPosition(after[0]) : null;
}

/** 直接改写份额与成本（用户手工订正，不走加权合并） */
export async function updatePosition(
  id: number,
  patch: Pick<Position, 'shares' | 'costPrice'> & { note?: string },
): Promise<void> {
  if (!isTauri()) return;
  await (await getDb()).execute(
    `UPDATE positions SET shares = $1, cost_price = $2, note = $3, updated_at = $4
     WHERE id = $5`,
    [patch.shares, patch.costPrice, patch.note ?? null, Date.now(), id],
  );
}

export async function deletePosition(id: number): Promise<void> {
  if (!isTauri()) return;
  await (await getDb()).execute(`DELETE FROM positions WHERE id = $1`, [id]);
}
