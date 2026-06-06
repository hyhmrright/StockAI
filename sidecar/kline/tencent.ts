import type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode, NormalizedRequest } from "./types";
import { KLINE_FETCH_TIMEOUT_MS } from "./types";
import { parseChinaSymbol } from "./symbol";

/** 把通用周期映射为腾讯 param */
export function mapPeriodToTencent(period: KlinePeriod): string {
  return ({ "1m": "m1", "5m": "m5", "15m": "m15", "30m": "m30", "60m": "m60", "1d": "day", "1w": "week", "1mo": "month" } as const)[period];
}

/** 估算每周期需要多少根 K 线满足 range */
function countForRange(_period: KlinePeriod, range: KlineRange): number {
  const map: Record<KlineRange, number> = {
    "1d": 240, "5d": 480, "1m": 30, "3m": 90, "6m": 180,
    "ytd": 365, "1y": 250, "5y": 260, "all": 800,
  };
  return map[range];
}

export async function fetchTencentKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const { prefix, code } = parseChinaSymbol(req.rawSymbol);
  const tencentSymbol = `${prefix}${code}`;
  const period = mapPeriodToTencent(req.period);
  const adjust = req.adjust === "qfq" ? "qfq" : req.adjust === "hfq" ? "hfq" : "";
  const count = countForRange(req.period, req.range);

  // 接口：分钟 K 用 kline/mkline，日/周/月 K 用 fqkline/get
  const isMinute = period.startsWith("m");
  const endpoint = isMinute
    ? `https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=${tencentSymbol},${period},,${count}`
    : `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentSymbol},${period},,,${count},${adjust}`;

  const resp = await fetch(endpoint, { signal: AbortSignal.timeout(KLINE_FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`腾讯 K 线 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseTencentKline(json, tencentSymbol, req.adjust, period);
}

/** 腾讯 K 线接口响应结构 */
interface TencentKlineResponse {
  code?: number;
  msg?: string;
  data?: Record<string, Record<string, Array<[string, ...string[]]>>>;
}

export function parseTencentKline(json: TencentKlineResponse, symbol: string, adjust: AdjustMode, period: string): KlinePoint[] {
  if (json?.code !== 0 && json?.code != null) throw new Error(`腾讯响应错误：${json.msg || json.code}`);
  const node = json?.data?.[symbol];
  if (!node) throw new Error(`腾讯响应缺少 ${symbol}`);
  const key = adjust === "qfq" ? `qfq${period}` : adjust === "hfq" ? `hfq${period}` : period;
  const arr = node[key] || node[period] || [];

  return arr.map((row) => {
    // 日/周/月：[date, open, close, high, low, volume(手), {}, amount?]
    // 分钟：[datetime, open, close, high, low, volume(手), ...]
    const time = Math.floor(new Date(row[0].length === 10 ? row[0] + "T00:00:00+08:00" : row[0] + "+08:00").getTime() / 1000);
    return {
      time,
      open: parseFloat(row[1]),
      close: parseFloat(row[2]),
      high: parseFloat(row[3]),
      low: parseFloat(row[4]),
      volume: parseFloat(row[5]) * 100, // 手 → 股
      amount: parseAmount(row[7]),
    };
  });
}

function parseAmount(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.endsWith("亿")) return parseFloat(v) * 1e8;
    if (v.endsWith("万")) return parseFloat(v) * 1e4;
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

export async function fetchTencentQuote(symbol: string): Promise<RealtimeQuote> {
  const { prefix, code } = parseChinaSymbol(symbol);
  const tencentSymbol = `${prefix}${code}`;
  const url = `https://web.sqt.gtimg.cn/q=${tencentSymbol}`;
  const resp = await fetch(url, { headers: { Referer: "https://gu.qq.com" }, signal: AbortSignal.timeout(KLINE_FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`腾讯报价 HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder("gbk").decode(buf);
  return parseTencentQuote(text, tencentSymbol);
}

/**
 * 腾讯报价响应格式：v_sh600519="1~名称~代码~当前价~昨收~今开~成交量(手)~外盘~内盘~..."
 * 字段索引（0-based）：1=名称, 3=当前价, 4=昨收, 5=今开, 6=成交量(手),
 *                      30=报价时间, 31=涨跌额, 32=涨跌幅, 33=最高, 34=最低,
 *                      37=成交额(万), 38=换手率, 39=PE, 45=市值(亿), 46=PB
 *
 * 注：字段索引基于本测试中的 fixture（与 plan 一致）；若真实接口字段位置漂移，
 * 调整下方 f[N] 索引即可，测试 fixture 需同步更新。
 */
export function parseTencentQuote(text: string, symbol: string): RealtimeQuote {
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1]) throw new Error(`腾讯报价为空：${symbol}`);
  const f = m[1].split("~");
  if (f.length < 30) throw new Error(`腾讯报价字段不足：${f.length}`);

  const price = parseFloat(f[3]);
  const prevClose = parseFloat(f[4]);
  const change = parseFloat(f[31]) || (price - prevClose);
  const changePercent = parseFloat(f[32]) || ((change / prevClose) * 100);
  const marketCapYi = parseFloat(f[45]); // 总市值（亿元），下方转为元

  return {
    symbol,
    name: f[1],
    price,
    change: Number(change.toFixed(3)),
    changePercent: Number(changePercent.toFixed(2)),
    open: parseFloat(f[5]),
    high: parseFloat(f[33]),
    low: parseFloat(f[34]),
    prevClose,
    volume: parseFloat(f[6]) * 100,
    amount: (parseFloat(f[37]) || 0) * 1e4,
    turnoverRate: parseFloat(f[38]) || undefined,
    pe: parseFloat(f[39]) || undefined,
    pb: parseFloat(f[46]) || undefined,
    marketCap: marketCapYi ? marketCapYi * 1e8 : undefined,
    timestamp: parseTencentTime(f[30]),
    currency: "CNY",
    market: "A股",
  };
}

function parseTencentTime(t: string): number {
  if (!t) return Math.floor(Date.now() / 1000);
  // 格式 "20260522150000" 或 "2026-05-22 15:00:00"
  if (/^\d{14}$/.test(t)) {
    const y = t.slice(0, 4), m = t.slice(4, 6), d = t.slice(6, 8);
    const hh = t.slice(8, 10), mm = t.slice(10, 12), ss = t.slice(12, 14);
    return Math.floor(new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`).getTime() / 1000);
  }
  return Math.floor(new Date(t + "+08:00").getTime() / 1000);
}
