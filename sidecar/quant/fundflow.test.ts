import { describe, test, expect } from 'bun:test';
import { parseFundFlow, parseSinaFundFlow } from './fundflow';

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

describe('parseSinaFundFlow（东财整机故障时的备源）', () => {
  /** 真实响应的字段布局；数值取自 sh600519 实测 */
  const BODY = JSON.stringify({
    r0_in: '858354941.3600',
    r0_out: '916785907.2500',
    r0: '1944848808.7100',
    r1_in: '459822016.2000',
    r1_out: '515021348.6100',
    r1: '1165767285.6100',
    r2_in: '39993004.7000',
    r2_out: '41312108.4400',
    r2: '107982414.1400',
    r3_in: '0.0000',
    r3_out: '0.0000',
    r3: '0.0000',
    name: 'MOUTAI',
  });

  test('各档净额由 in-out 算出', () => {
    const r = parseSinaFundFlow(BODY);
    expect(r?.superLargeNet).toBeCloseTo(-58_430_965.89, 1);
    expect(r?.largeNet).toBeCloseTo(-55_199_332.41, 1);
    expect(r?.mediumNet).toBeCloseTo(-1_319_103.74, 1);
    expect(r?.smallNet).toBe(0);
  });

  test('主力 = 超大单 + 大单，与四档合计对得上', () => {
    const r = parseSinaFundFlow(BODY);
    expect(r?.mainNet).toBeCloseTo(-113_630_298.3, 1);
    // 四档净额之和即新浪自己给的 netamount(-114949402.04)，可交叉验证口径
    const sum =
      (r?.superLargeNet ?? 0) + (r?.largeNet ?? 0) + (r?.mediumNet ?? 0) + (r?.smallNet ?? 0);
    expect(sum).toBeCloseTo(-114_949_402.04, 1);
  });

  test('主力占比的分母用四档成交额之和', () => {
    expect(parseSinaFundFlow(BODY)?.mainNetPct).toBeCloseTo(-3.53, 2);
  });

  test('date 留空——本源是实时快照，编一个日期会在周末标错', () => {
    expect(parseSinaFundFlow(BODY)?.date).toBeUndefined();
  });

  test('四档全缺时返回 null，不产出一份全 0 的假资金流', () => {
    // 全 0 会在卡片上显示成"今日资金无进出"，比没有更误导
    expect(parseSinaFundFlow(JSON.stringify({ name: 'X', trade: '1' }))).toBeNull();
  });

  test('非 JSON 响应返回 null', () => {
    expect(parseSinaFundFlow('<html>blocked</html>')).toBeNull();
  });
});
