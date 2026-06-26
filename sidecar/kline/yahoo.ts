import type { KlinePoint, RealtimeQuote, KlineRange, NormalizedRequest } from './types';
import { KLINE_FETCH_TIMEOUT_MS } from './types';

/**
 * 把 UI 选择的范围映射为 Yahoo Chart API 的 (range, interval)
 */
export function mapRangeToYahoo(range: KlineRange): { range: string; interval: string } {
  switch (range) {
    case '1d':
      return { range: '1d', interval: '1m' };
    case '5d':
      return { range: '5d', interval: '5m' };
    case '1m':
      return { range: '1mo', interval: '1d' };
    case '3m':
      return { range: '3mo', interval: '1d' };
    case '6m':
      return { range: '6mo', interval: '1d' };
    case 'ytd':
      return { range: 'ytd', interval: '1d' };
    case '1y':
      return { range: '1y', interval: '1d' };
    case '5y':
      return { range: '5y', interval: '1wk' };
    case 'all':
      return { range: 'max', interval: '1mo' };
    default: {
      // 编译期穷尽性检查：若 KlineRange 新增值未在此分支，TypeScript 会报错
      const _exhaustive: never = range;
      throw new Error(`unsupported range: ${_exhaustive}`);
    }
  }
}

/**
 * 拉取美股 K 线
 */
export async function fetchYahooKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const { range, interval } = mapRangeToYahoo(req.range);
  const symbol = req.rawSymbol.replace(/^gb_/i, '').toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(KLINE_FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Yahoo K 线响应 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooChart(json);
}

/** Yahoo Chart API 响应结构 */
interface YahooChartResponse {
  chart?: {
    error?: { code?: string; description?: string };
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
      meta?: YahooMeta;
    }>;
  };
}

/** Yahoo meta 字段（报价 + 盘前盘后） */
interface YahooMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  shortName?: string;
  longName?: string;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: number;
  currency?: string;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
}

/**
 * 解析 Yahoo Chart API 响应
 */
export function parseYahooChart(json: YahooChartResponse): KlinePoint[] {
  if (json?.chart?.error) {
    throw new Error(`Yahoo 错误：${json.chart.error.description || json.chart.error.code}`);
  }
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo 响应缺少 result');

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const points: KlinePoint[] = [];

  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i],
      h = q.high?.[i],
      l = q.low?.[i],
      c = q.close?.[i],
      v = q.volume?.[i];
    // 任一字段缺失 → 丢弃这根（Yahoo 在非交易日会塞 null）
    if (o == null || h == null || l == null || c == null) continue;
    points.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: v ?? 0 });
  }
  return points;
}

/**
 * 拉取美股实时报价 — 复用 Chart API meta 字段（无需额外接口）
 */
export async function fetchYahooQuote(symbol: string): Promise<RealtimeQuote> {
  const upper = symbol.replace(/^gb_/i, '').toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?range=1d&interval=1m&includePrePost=true`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(KLINE_FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Yahoo Quote 响应 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseYahooQuote(json, upper);
}

/** Yahoo 报价响应（复用 YahooChartResponse 结构） */
type YahooQuoteResponse = YahooChartResponse;

/**
 * 解析 Yahoo meta 字段为 RealtimeQuote
 */
export function parseYahooQuote(json: YahooQuoteResponse, symbol: string): RealtimeQuote {
  if (json?.chart?.error) throw new Error(`Yahoo Quote 错误：${json.chart.error.code}`);
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('Yahoo Quote 缺少 meta');

  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  const out: RealtimeQuote = {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    change: Number(change.toFixed(4)),
    changePercent: Number(changePercent.toFixed(2)),
    open: meta.regularMarketOpen ?? 0,
    high: meta.regularMarketDayHigh ?? 0,
    low: meta.regularMarketDayLow ?? 0,
    prevClose,
    volume: meta.regularMarketVolume ?? 0,
    amount: 0, // Yahoo Chart API 不返回成交额，填 0
    high52w: meta.fiftyTwoWeekHigh,
    low52w: meta.fiftyTwoWeekLow,
    timestamp: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
    currency: meta.currency === 'CNY' ? 'CNY' : 'USD', // 仅接受 CNY/USD，其它一律回退到 USD
    market: '美股',
  };

  if (meta.preMarketPrice != null) {
    out.preMarket = {
      price: meta.preMarketPrice,
      change: meta.preMarketChange ?? 0,
      changePercent: meta.preMarketChangePercent ?? 0,
    };
  }
  if (meta.postMarketPrice != null) {
    out.postMarket = {
      price: meta.postMarketPrice,
      change: meta.postMarketChange ?? 0,
      changePercent: meta.postMarketChangePercent ?? 0,
    };
  }
  return out;
}
