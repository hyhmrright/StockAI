import { describe, test, expect } from 'bun:test';
import { parseYahooChart, parseYahooQuote, mapRangeToYahoo } from './yahoo';

describe('mapRangeToYahoo', () => {
  test('1d → 1m 分钟', () => {
    expect(mapRangeToYahoo('1d')).toEqual({ range: '1d', interval: '1m' });
  });
  test('1y → 日 K', () => {
    expect(mapRangeToYahoo('1y')).toEqual({ range: '1y', interval: '1d' });
  });
  test('5y → 周 K', () => {
    expect(mapRangeToYahoo('5y')).toEqual({ range: '5y', interval: '1wk' });
  });
  test('all → 月 K', () => {
    expect(mapRangeToYahoo('all')).toEqual({ range: 'max', interval: '1mo' });
  });
  test('5d → 5 分钟 K', () => {
    expect(mapRangeToYahoo('5d')).toEqual({ range: '5d', interval: '5m' });
  });
});

describe('parseYahooChart', () => {
  const FIXTURE = {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 180.5, currency: 'USD', symbol: 'AAPL' },
          timestamp: [1700000000, 1700086400],
          indicators: {
            quote: [
              {
                open: [178.0, 179.5],
                high: [181.2, 182.0],
                low: [177.0, 178.5],
                close: [180.0, 180.5],
                volume: [50_000_000, 55_000_000],
              },
            ],
          },
        },
      ],
      error: null,
    },
  };

  test('解析合法响应为 KlinePoint[]', () => {
    const points = parseYahooChart(FIXTURE);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      time: 1700000000,
      open: 178.0,
      high: 181.2,
      low: 177.0,
      close: 180.0,
      volume: 50_000_000,
    });
  });

  test('跳过含 null 字段的不完整 K 线', () => {
    const dirty = JSON.parse(JSON.stringify(FIXTURE));
    dirty.chart.result[0].indicators.quote[0].close = [180.0, null];
    const points = parseYahooChart(dirty);
    expect(points).toHaveLength(1);
  });

  test('响应错误 → 抛错', () => {
    expect(() =>
      parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } }),
    ).toThrow();
  });

  test('空响应 / 缺少 result → 抛错', () => {
    expect(() => parseYahooChart({ chart: { result: null, error: null } })).toThrow('缺少 result');
  });
});

describe('parseYahooQuote', () => {
  const FIXTURE = {
    chart: {
      result: [
        {
          meta: {
            symbol: 'AAPL',
            shortName: 'Apple Inc.',
            regularMarketPrice: 180.5,
            chartPreviousClose: 178.0,
            regularMarketOpen: 179.0,
            regularMarketDayHigh: 182.0,
            regularMarketDayLow: 178.5,
            regularMarketVolume: 55_000_000,
            currency: 'USD',
            fiftyTwoWeekHigh: 200.0,
            fiftyTwoWeekLow: 150.0,
            preMarketPrice: 181.0,
            preMarketChange: 0.5,
            preMarketChangePercent: 0.28,
            regularMarketTime: 1700086400,
          },
        },
      ],
      error: null,
    },
  };

  test('解析为 RealtimeQuote', () => {
    const q = parseYahooQuote(FIXTURE, 'AAPL');
    expect(q.price).toBe(180.5);
    expect(q.prevClose).toBe(178.0);
    expect(q.change).toBeCloseTo(2.5, 2);
    expect(q.changePercent).toBeCloseTo(1.4, 2);
    expect(q.preMarket?.price).toBe(181.0);
    expect(q.high52w).toBe(200.0);
    expect(q.market).toBe('美股');
  });
});
