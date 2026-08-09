import { describe, test, expect } from 'bun:test';
import {
  parseSinaDailyK,
  parseSinaUsQuote,
  parseSinaCnQuote,
  aggregateBars,
  trimToRange,
  sinaSupportsPeriod,
} from './sina';
import type { KlinePoint, KlinePeriod } from './types';

/** 真实响应外面裹着一段防盗链 JSONP 注释，fixture 必须原样带上 */
function jsonp(rows: unknown[]): string {
  return `/*<script>location.href='//sina.com';</script>*/\nx(${JSON.stringify(rows)});`;
}

const day = (d: string, o: number, h: number, l: number, c: number, v = 100) => ({
  d,
  o: String(o),
  h: String(h),
  l: String(l),
  c: String(c),
  v: String(v),
});

describe('parseSinaDailyK', () => {
  test('剥掉 JSONP 外壳并解析出各价位', () => {
    const pts = parseSinaDailyK(
      jsonp([day('2026-08-07', 311.45, 314.81, 310.74, 313.33, 34437191)]),
    );
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({
      open: 311.45,
      high: 314.81,
      low: 310.74,
      close: 313.33,
      volume: 34437191,
    });
  });

  test('日线时间戳落在美股当日交易时段内，各时区都仍是同一日历日', () => {
    const [pt] = parseSinaDailyK(jsonp([day('2026-08-07', 1, 2, 0.5, 1.5)]));
    // 用 UTC 零点会让西半球退回前一天；这里取 14:00 UTC（EDT 10:00 / EST 09:00）
    expect(new Date(pt.time * 1000).toISOString()).toBe('2026-08-07T14:00:00.000Z');
    for (const tz of [-13, -5, 8, 9]) {
      const shifted = new Date((pt.time + tz * 3600) * 1000);
      expect(shifted.toISOString().slice(0, 10)).toBe('2026-08-07');
    }
  });

  test('停牌日的 0 价整根丢弃，不填 0 上图', () => {
    // 填 0 会在图上砸出一根到地板的假 K，比缺一根糟得多
    const pts = parseSinaDailyK(
      jsonp([day('2026-08-06', 0, 0, 0, 0), day('2026-08-07', 311, 315, 310, 313)]),
    );
    expect(pts.map((p) => p.close)).toEqual([313]);
  });

  test('响应不含数组体时抛出，而不是静静返回空表', () => {
    expect(() => parseSinaDailyK('<html>403 forbidden</html>')).toThrow('不含数组体');
  });
});

describe('aggregateBars 日线聚合', () => {
  const bars: KlinePoint[] = [
    // 2026-08-03(一) ~ 08-07(五) 同一周；08-10(一) 属下一周
    {
      time: Date.parse('2026-08-03T14:00:00Z') / 1000,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 1,
    },
    {
      time: Date.parse('2026-08-05T14:00:00Z') / 1000,
      open: 11,
      high: 15,
      low: 8,
      close: 14,
      volume: 2,
    },
    {
      time: Date.parse('2026-08-07T14:00:00Z') / 1000,
      open: 14,
      high: 14,
      low: 13,
      close: 13,
      volume: 4,
    },
    {
      time: Date.parse('2026-08-10T14:00:00Z') / 1000,
      open: 13,
      high: 20,
      low: 13,
      close: 19,
      volume: 8,
    },
  ];

  test('周线：开取首根、收取末根、高低取极值、量求和', () => {
    const weekly = aggregateBars(bars, '1w');
    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toMatchObject({ open: 10, high: 15, low: 8, close: 13, volume: 7 });
    expect(weekly[1]).toMatchObject({ open: 13, close: 19, volume: 8 });
  });

  test('周线时间取区间首根，与 lightweight-charts / Yahoo 的口径一致', () => {
    expect(aggregateBars(bars, '1w')[0].time).toBe(bars[0].time);
  });

  test('月线跨月分组，同月不同周并成一根', () => {
    const monthly = aggregateBars(bars, '1mo');
    expect(monthly).toHaveLength(1);
    expect(monthly[0]).toMatchObject({ open: 10, high: 20, low: 8, close: 19, volume: 15 });
  });

  test('跨年相邻的两周不会被并成一根', () => {
    // 周分组键若只用「年内第几周」，第 52 周与次年第 1 周会撞号
    const crossYear: KlinePoint[] = [
      {
        time: Date.parse('2025-12-29T14:00:00Z') / 1000,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
      },
      {
        time: Date.parse('2026-01-05T14:00:00Z') / 1000,
        open: 2,
        high: 2,
        low: 2,
        close: 2,
        volume: 1,
      },
    ];
    expect(aggregateBars(crossYear, '1w')).toHaveLength(2);
  });

  test('空输入返回空表', () => {
    expect(aggregateBars([], '1w')).toEqual([]);
  });
});

describe('trimToRange', () => {
  const now = Date.parse('2026-08-09T00:00:00Z');
  const at = (iso: string): KlinePoint => ({
    time: Date.parse(iso) / 1000,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  });
  const bars = [at('2024-06-01T14:00:00Z'), at('2026-01-05T14:00:00Z'), at('2026-08-07T14:00:00Z')];

  test("'all' 不截断", () => {
    expect(trimToRange(bars, 'all', now)).toHaveLength(3);
  });

  test("'1m' 只留近一个月", () => {
    expect(trimToRange(bars, '1m', now)).toHaveLength(1);
  });

  test("'ytd' 从当年 1 月 1 日起算", () => {
    expect(trimToRange(bars, 'ytd', now)).toHaveLength(2);
  });
});

describe('sinaSupportsPeriod', () => {
  test('只认日/周/月——分钟线接口早已下线，声明支持等于白打一趟', () => {
    const supported: KlinePeriod[] = ['1d', '1w', '1mo'];
    const minute: KlinePeriod[] = ['1m', '5m', '15m', '30m', '60m'];
    expect(supported.every(sinaSupportsPeriod)).toBe(true);
    expect(minute.some(sinaSupportsPeriod)).toBe(false);
  });
});

describe('parseSinaUsQuote', () => {
  /** 字段布局见 sina.ts 注释；这里按下标填，避免手写长逗号串数错位 */
  function body(over: Record<number, string> = {}) {
    const f = new Array(36).fill('0');
    f[0] = 'Apple';
    f[1] = '313.3300';
    f[2] = '0.29';
    f[4] = '0.9200';
    f[5] = '311.4500';
    f[6] = '314.8100';
    f[7] = '310.7400';
    f[8] = '344.5700';
    f[9] = '218.2000';
    f[10] = '34437191';
    f[12] = '4572794617424';
    f[14] = '37.750000';
    f[26] = '312.4100';
    f[30] = '10776298882.0000';
    for (const [i, v] of Object.entries(over)) f[Number(i)] = v;
    return `var hq_str_gb_aapl="${f.join(',')}";`;
  }

  test('解析出核心价位与估值字段', () => {
    const q = parseSinaUsQuote(body(), 'AAPL');
    expect(q).toMatchObject({
      symbol: 'AAPL',
      price: 313.33,
      prevClose: 312.41,
      change: 0.92,
      changePercent: 0.29,
      high52w: 344.57,
      low52w: 218.2,
      pe: 37.75,
      currency: 'USD',
      market: '美股',
    });
  });

  test('新浪把「无此字段」写成 0，不能当真值透传', () => {
    // PE=0 / 市值=0 会直接上屏，比留空更误导
    const q = parseSinaUsQuote(body({ 12: '0', 14: '0', 8: '0' }), 'AAPL');
    expect(q.pe).toBeUndefined();
    expect(q.marketCap).toBeUndefined();
    expect(q.high52w).toBeUndefined();
  });

  test('盘后价存在时才带 postMarket', () => {
    expect(parseSinaUsQuote(body(), 'AAPL').postMarket).toBeUndefined();
    expect(parseSinaUsQuote(body({ 21: '313.25', 23: '-0.08' }), 'AAPL').postMarket).toMatchObject({
      price: 313.25,
      changePercent: -0.08,
    });
  });

  test('空载荷与现价为 0 都抛出，不返回一份价格为 0 的报价', () => {
    expect(() => parseSinaUsQuote('var hq_str_gb_aapl="";', 'AAPL')).toThrow('为空');
    expect(() => parseSinaUsQuote(body({ 1: '0' }), 'AAPL')).toThrow('无效');
  });
});

describe('parseSinaCnQuote', () => {
  function body(over: Record<number, string> = {}) {
    const f = new Array(33).fill('0');
    f[0] = 'MOUTAI';
    f[1] = '1308.660';
    f[2] = '1308.550';
    f[3] = '1309.220';
    f[4] = '1315.280';
    f[5] = '1301.000';
    f[8] = '2497581';
    f[9] = '3266919421.000';
    f[30] = '2026-08-07';
    f[31] = '15:34:59';
    for (const [i, v] of Object.entries(over)) f[Number(i)] = v;
    return `var hq_str_sh600519="${f.join(',')}";`;
  }

  test('涨跌额/幅由现价与昨收推算——新浪 A 股串里没有这两个字段', () => {
    const q = parseSinaCnQuote(body(), 'sh600519');
    expect(q).toMatchObject({ price: 1309.22, prevClose: 1308.55, currency: 'CNY', market: 'A股' });
    expect(q.change).toBeCloseTo(0.67, 2);
    expect(q.changePercent).toBeCloseTo(0.05, 2);
  });

  test('成交量单位是股，不再 ×100', () => {
    // 腾讯给的是手、要 ×100；照抄那套换算会让新浪的量虚高百倍
    expect(parseSinaCnQuote(body(), 'sh600519').volume).toBe(2497581);
  });

  test('时间按北京时区解析', () => {
    const q = parseSinaCnQuote(body(), 'sh600519');
    expect(new Date(q.timestamp * 1000).toISOString()).toBe('2026-08-07T07:34:59.000Z');
  });

  test('昨收为 0 时涨跌幅取 0 而非 NaN/Infinity', () => {
    expect(parseSinaCnQuote(body({ 2: '0' }), 'sh600519').changePercent).toBe(0);
  });
});
