import { describe, test, expect } from 'bun:test';
import {
  parseTencentKline,
  parseTencentQuote,
  parseTencentUsQuote,
  mapPeriodToTencent,
} from './tencent';

describe('mapPeriodToTencent', () => {
  test('1m → m1', () => expect(mapPeriodToTencent('1m')).toBe('m1'));
  test('5m → m5', () => expect(mapPeriodToTencent('5m')).toBe('m5'));
  test('1d → day', () => expect(mapPeriodToTencent('1d')).toBe('day'));
  test('1w → week', () => expect(mapPeriodToTencent('1w')).toBe('week'));
  test('1mo → month', () => expect(mapPeriodToTencent('1mo')).toBe('month'));
});

describe('parseTencentKline', () => {
  const FIXTURE = {
    code: 0,
    msg: '',
    data: {
      sh600519: {
        qfqday: [
          ['2024-12-30', '1670.00', '1683.50', '1689.00', '1665.20', '3210000', '{}', '53.85亿'],
          ['2024-12-31', '1683.50', '1690.00', '1695.00', '1680.00', '2850000', '{}', '48.20亿'],
        ],
      },
    },
  };

  test('解析合法响应', () => {
    const points = parseTencentKline(FIXTURE, 'sh600519', 'qfq', 'day');
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      open: 1670.0,
      close: 1683.5,
      high: 1689.0,
      low: 1665.2,
      volume: 321_000_000, // 手 × 100
    });
  });

  test('响应 code 非 0 → 抛错', () => {
    expect(() => parseTencentKline({ code: 1, msg: 'fail' }, 'sh600519', 'qfq', 'day')).toThrow();
  });

  test('不复权数据从 day 字段读取', () => {
    const fix = {
      code: 0,
      data: {
        sh600519: {
          day: [['2024-12-30', '1670', '1683.5', '1689', '1665', '100000', '{}', '1.6亿']],
        },
      },
    };
    const points = parseTencentKline(fix, 'sh600519', 'none', 'day');
    expect(points).toHaveLength(1);
  });
});

describe('parseTencentQuote', () => {
  // 腾讯实时报价格式（约 50 字段）
  // 字段索引：1=名称, 3=当前价, 4=昨收, 5=今开, 6=成交量(手),
  //           30=时间, 31=涨跌额, 32=涨跌幅, 33=最高, 34=最低,
  //           37=成交额(万), 38=换手率, 39=PE, 45=市值(亿), 46=PB
  const RAW = `v_sh600519="1~贵州茅台~600519~1683.50~1671.10~1671.10~3210000~1605000~1605000~~~~~~~~~~~~~~~~~~~~~~2026-05-22 15:00:00~12.40~0.74~1689.00~1665.20~~~53850.00~0.25~27.30~~~~~~2100.00~8.20~~~~~~~~~~~~~~~"`;

  test('解析为 RealtimeQuote', () => {
    const q = parseTencentQuote(RAW, 'sh600519');
    expect(q.name).toBe('贵州茅台');
    expect(q.price).toBe(1683.5);
    expect(q.prevClose).toBe(1671.1);
    expect(q.change).toBeCloseTo(12.4, 2);
    expect(q.high).toBe(1689.0);
    expect(q.low).toBe(1665.2);
    expect(q.turnoverRate).toBe(0.25);
    expect(q.market).toBe('A股');
    expect(q.currency).toBe('CNY');
  });

  test('缺失内容字符串 → 抛错', () => {
    expect(() => parseTencentQuote(`v_sh600519="";`, 'sh600519')).toThrow();
  });
});

describe('parseTencentUsQuote', () => {
  // 真实 usAAPL 响应的字段布局（下标见 tencent.ts 注释）
  function body(over: Record<number, string> = {}) {
    const f = new Array(50).fill('0');
    f[1] = '苹果';
    f[3] = '313.33';
    f[4] = '312.41';
    f[5] = '311.45';
    f[6] = '34437191';
    f[30] = '2026-08-07 16:00:01';
    f[31] = '0.92';
    f[32] = '0.29';
    f[33] = '314.81';
    f[34] = '310.74';
    f[35] = 'USD';
    f[37] = '10776446647';
    f[39] = '35.93';
    f[45] = '45727.94419';
    f[46] = 'Apple Inc.';
    f[48] = '344.57';
    f[49] = '218.40';
    for (const [i, v] of Object.entries(over)) f[Number(i)] = v;
    return `v_usAAPL="${f.join('~')}";`;
  }

  test('解析为 RealtimeQuote', () => {
    const q = parseTencentUsQuote(body(), 'AAPL');
    expect(q).toMatchObject({
      symbol: 'AAPL',
      name: '苹果',
      price: 313.33,
      prevClose: 312.41,
      high: 314.81,
      low: 310.74,
      pe: 35.93,
      high52w: 344.57,
      low52w: 218.4,
      currency: 'USD',
      market: '美股',
    });
    expect(q.change).toBeCloseTo(0.92, 2);
  });

  test('美股成交量已是股数、成交额已是绝对值，不套 A 股那两处换算', () => {
    // A 股解析器对 f[6] ×100（手→股）、对 f[37] ×1e4（万→元）；照搬会虚高百倍/万倍
    const q = parseTencentUsQuote(body(), 'AAPL');
    expect(q.volume).toBe(34437191);
    expect(q.amount).toBe(10776446647);
  });

  test('f[46] 在美股是英文名而非市净率，绝不能落进 pb', () => {
    // 复用 parseTencentQuote 就会把 "Apple Inc." 塞进 pb —— 本条即为此设防
    expect(parseTencentUsQuote(body(), 'AAPL').pb).toBeUndefined();
  });

  test('市值按亿换算为元', () => {
    expect(parseTencentUsQuote(body(), 'AAPL').marketCap).toBeCloseTo(45727.94419 * 1e8, 0);
  });

  test('空载荷与现价为 0 都抛出', () => {
    expect(() => parseTencentUsQuote('v_usAAPL="";', 'AAPL')).toThrow('为空');
    expect(() => parseTencentUsQuote(body({ 3: '0' }), 'AAPL')).toThrow('无效');
  });
});
