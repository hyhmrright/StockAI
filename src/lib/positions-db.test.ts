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

  it('新标的走 INSERT', async () => {
    mockSelect
      .mockResolvedValueOnce([]) // 查已有 → 无
      .mockResolvedValueOnce([row({ symbol: 'MSFT' })]); // 回读

    await upsertPosition({ symbol: 'MSFT', shares: 10, costPrice: 300, openedAt: 1 });

    expect(String(mockExecute.mock.calls[0][0])).toContain('INSERT INTO positions');
  });

  it('已有标的走 UPDATE，并按份额加权合并成本——不是插第二行', async () => {
    // 同一只股票两行不同成本在界面上无法解释；用户心里的"我的成本"是加权均价
    mockSelect
      .mockResolvedValueOnce([row({ shares: 100, cost_price: 10 })])
      .mockResolvedValueOnce([row({ shares: 400, cost_price: 17.5 })]);

    await upsertPosition({ symbol: 'AAPL', shares: 300, costPrice: 20, openedAt: 2 });

    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('UPDATE positions');
    expect(params[1]).toBe(400); // 100 + 300
    expect(params[2]).toBe(17.5); // (100×10 + 300×20) / 400，不是算术平均 15
  });

  it('加仓不覆盖已有的名称——加仓表单通常只填代码与价格', async () => {
    mockSelect.mockResolvedValueOnce([row({ name: 'Apple' })]).mockResolvedValueOnce([row()]);

    await upsertPosition({ symbol: 'AAPL', shares: 1, costPrice: 1, openedAt: 2 });

    expect(mockExecute.mock.calls[0][1][0]).toBe('Apple');
  });

  it('deletePosition 按 id 删', async () => {
    await deletePosition(7);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('DELETE FROM positions');
    expect(params).toEqual([7]);
  });
});
