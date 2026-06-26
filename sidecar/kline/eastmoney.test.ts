import { describe, test, expect } from 'bun:test';
import { parseEastmoneyKline, mapPeriodToEastmoney, mapAdjustToEastmoney } from './eastmoney';

describe('mapPeriodToEastmoney', () => {
  test('1d → klt=101', () => expect(mapPeriodToEastmoney('1d')).toBe(101));
  test('1w → klt=102', () => expect(mapPeriodToEastmoney('1w')).toBe(102));
  test('1mo → klt=103', () => expect(mapPeriodToEastmoney('1mo')).toBe(103));
  test('5m → klt=5', () => expect(mapPeriodToEastmoney('5m')).toBe(5));
});

describe('mapAdjustToEastmoney', () => {
  test('qfq → fqt=1', () => expect(mapAdjustToEastmoney('qfq')).toBe(1));
  test('hfq → fqt=2', () => expect(mapAdjustToEastmoney('hfq')).toBe(2));
  test('none → fqt=0', () => expect(mapAdjustToEastmoney('none')).toBe(0));
});

describe('parseEastmoneyKline', () => {
  const FIXTURE = {
    rc: 0,
    data: {
      code: '600519',
      market: 1,
      klines: [
        // 字段：日期, 开, 收, 高, 低, 成交量(手), 成交额, 振幅, 涨跌幅, 涨跌额, 换手率
        '2024-12-30,1670.00,1683.50,1689.00,1665.20,3210000,53850000000.00,1.43,0.74,12.40,0.25',
        '2024-12-31,1683.50,1690.00,1695.00,1680.00,2850000,48200000000.00,0.89,0.39,6.50,0.23',
      ],
    },
  };

  test('解析合法响应', () => {
    const points = parseEastmoneyKline(FIXTURE);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      open: 1670.0,
      close: 1683.5,
      high: 1689.0,
      low: 1665.2,
      volume: 321_000_000, // 手 × 100
      amount: 53_850_000_000,
    });
  });

  test('空数据 → 返回空数组', () => {
    expect(parseEastmoneyKline({ rc: 0, data: { klines: [] } })).toEqual([]);
  });
});
