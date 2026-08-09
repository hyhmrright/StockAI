import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: (...args: unknown[]) => mockExecute(...args),
      select: (...args: unknown[]) => mockSelect(...args),
    }),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));

import { upsertPosition, getPositions, deletePosition } from './positions-db';

/** 库里一行的原始形态（snake_case，与 SELECT 的列名一致） */
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  symbol: 'AAPL',
  name: 'Apple',
  shares: 100,
  cost_price: 10,
  opened_at: 1_700_000_000_000,
  note: null,
  ...over,
});

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue({ rowsAffected: 1 });
  mockSelect.mockReset().mockResolvedValue([]);
});

describe('positions-db', () => {
  it('getPositions 把 snake_case 行映射成 Position，空字段转 undefined', async () => {
    mockSelect.mockResolvedValue([row({ name: null, note: null })]);
    const [p] = await getPositions();
    expect(p).toEqual({
      id: 1,
      symbol: 'AAPL',
      name: undefined,
      shares: 100,
      costPrice: 10,
      openedAt: 1_700_000_000_000,
      note: undefined,
    });
  });

  it('建仓与加仓走同一条 INSERT..ON CONFLICT，写入前不再 SELECT', async () => {
    mockSelect.mockResolvedValueOnce([row({ symbol: 'MSFT' })]); // 写后回读

    const p = await upsertPosition({ symbol: 'MSFT', shares: 10, costPrice: 300, openedAt: 1 });

    // 关键断言：单语句原子写入。先读后写的两步之间正是竞态窗口——
    // 连点加仓会基于同一份旧值各算各的，后写覆盖前写
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);

    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO positions');
    expect(String(sql)).toContain('ON CONFLICT(symbol) DO UPDATE');
    expect(params.slice(0, 6)).toEqual(['MSFT', null, 10, 300, 1, null]);
    expect(p?.symbol).toBe('MSFT');
  });

  it('合并语义都在 SQL 里（mock 执行不到，数值语义已用真 SQLite 实测过）', async () => {
    // 实测记录：100股@10 加仓 300股@20 → 400股@17.5（加权均价，不是算术平均 15）；
    // name/note 传 NULL 不覆盖已有值；份额合计为 0 时 cost_price 落 0 而非 NULL
    await upsertPosition({ symbol: 'AAPL', shares: 300, costPrice: 20, openedAt: 2 });

    const sql = String(mockExecute.mock.calls[0][0]);
    // 加权均价：份额乘各自成本求和，再除以总份额
    expect(sql).toContain(
      '(positions.shares * positions.cost_price + excluded.shares * excluded.cost_price)',
    );
    expect(sql).toContain('/ (positions.shares + excluded.shares)');
    // 加仓表单通常只填代码与价格：NULL 不覆盖已有名称/备注
    expect(sql).toContain('COALESCE(excluded.name, positions.name)');
    expect(sql).toContain('COALESCE(excluded.note, positions.note)');
    // opened_at 不进 SET 列表：加仓保持首次建仓时间
    expect(sql).not.toMatch(/DO UPDATE SET[\s\S]*opened_at/);
  });

  it('deletePosition 按 id 删', async () => {
    await deletePosition(7);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM positions');
    expect(params).toEqual([7]);
  });
});
