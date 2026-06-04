import { describe, test, expect } from 'bun:test';
import { parseFundFlow } from './fundflow';

describe('parseFundFlow', () => {
  // 取自东财 600519 真实响应（fflow/daykline）
  const realLine =
    '2026-05-29,918724624.0,-2466552.0,-916258048.0,-19285088.0,938009712.0,9.15,-0.02,-9.13,-0.19,9.35,1326.00,3.92,0.00,0.00';

  test('解析最新一日主力/超大/大/中/小单净流入', () => {
    const r = parseFundFlow({ data: { klines: ['old-line', realLine] } });
    expect(r).toEqual({
      date: '2026-05-29',
      mainNet: 918724624,
      superLargeNet: -2466552,
      largeNet: -916258048,
      mediumNet: -19285088,
      smallNet: 938009712,
      mainNetPct: 9.15,
    });
  });

  test('空 / 缺字段 / 畸形响应返回 null', () => {
    expect(parseFundFlow({})).toBeNull();
    expect(parseFundFlow({ data: { klines: [] } })).toBeNull();
    expect(parseFundFlow({ data: { klines: ['2026-05-29,1,2'] } })).toBeNull(); // 字段不足
  });

  test('非数值字段降级为 0（不抛）', () => {
    const r = parseFundFlow({ data: { klines: ['2026-05-29,abc,,,,,xyz'] } });
    expect(r?.mainNet).toBe(0);
    expect(r?.mainNetPct).toBe(0);
  });
});
