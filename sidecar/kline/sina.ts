import type {
  KlinePoint,
  RealtimeQuote,
  KlinePeriod,
  KlineRange,
  NormalizedRequest,
} from './types';
import type { KlineSourceDeps } from './types';
import { fetchWithPolicy } from '../http';
import { parseChinaSymbol, parseUsSymbol } from './symbol';

/** hq.sinajs.cn 不带 Referer 一律返回空串，不是 4xx——少了它会静默得到空数据 */
const SINA_HEADERS = { Referer: 'https://finance.sina.com.cn' } as const;

/** 新浪行情接口一律 GBK，直接 resp.text() 会把中文名拿成乱码 */
async function readGbk(resp: Response): Promise<string> {
  return new TextDecoder('gbk').decode(await resp.arrayBuffer());
}

// ───────────────────────── 美股日 K ─────────────────────────

/**
 * 新浪只提供**日** K（分钟线接口早已下线，`US_MinKService.getMinKline` 返回
 * "Service not found"），周/月由日线聚合而来。
 */
export function sinaUsSupportsPeriod(period: KlinePeriod): boolean {
  return period === '1d' || period === '1w' || period === '1mo';
}

/**
 * 拉取美股日 K。接口一次返回**全量历史**（AAPL 一万余根，回溯到 1984），
 * 因此按 range 截取在本地做，不走参数。
 *
 * 注意：新浪的美股历史是**不复权**的原始价（AAPL 2020-08-28 收 499.23、08-31 收 129.04，
 * 4:1 拆股当天直接断崖）。Yahoo 是复权的，故本源在 KLINE_SOURCES 里排在 Yahoo 之后，
 * 只在 Yahoo 不可达（不少地区直接被墙）时兜底——有断层的历史也远好过整片空白。
 */
export async function fetchSinaUsKline(
  req: NormalizedRequest,
  deps: KlineSourceDeps = {},
): Promise<KlinePoint[]> {
  const { ticker, isIndex } = parseUsSymbol(req.rawSymbol);
  // 指数走的是另一套接口，且 IndexBar 只用报价不画 K 线，这里直接让位给下一个源
  if (isIndex) throw new Error(`新浪日 K 不支持指数：${req.rawSymbol}`);

  const url = `https://stock.finance.sina.com.cn/usstock/api/jsonp.php/x/US_MinKService.getDailyK?symbol=${encodeURIComponent(ticker)}`;
  const resp = await fetchWithPolicy(url, { headers: SINA_HEADERS, fetchImpl: deps.fetchImpl });
  if (!resp.ok) throw new Error(`新浪美股日 K HTTP ${resp.status}`);

  const daily = parseSinaDailyK(await resp.text());
  const bars =
    req.period === '1w' || req.period === '1mo' ? aggregateBars(daily, req.period) : daily;
  return trimToRange(bars, req.range);
}

/** 新浪日 K 单条：d=日期 o=开 h=高 l=低 c=收 v=成交量 a=成交额(恒为 "0"，故不采用) */
interface SinaDailyRow {
  d?: string;
  o?: string;
  h?: string;
  l?: string;
  c?: string;
  v?: string;
}

/**
 * 解析日 K 响应。返回体是 JSONP 且前面挂着一段 `/*<script>...*\/` 的防盗链注释，
 * 所以只认第一个 `[` 到最后一个 `]` 之间的数组体。
 */
export function parseSinaDailyK(raw: string): KlinePoint[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('新浪日 K 响应不含数组体');

  let rows: SinaDailyRow[];
  try {
    rows = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('新浪日 K 响应 JSON 解析失败');
  }

  const points: KlinePoint[] = [];
  for (const r of rows) {
    if (!r?.d) continue;
    const open = Number(r.o);
    const high = Number(r.h);
    const low = Number(r.l);
    const close = Number(r.c);
    // 停牌日各价位可能是 0 或非数，丢弃而非填 0——填 0 会在图上砸出一根到地板的假 K
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;
    points.push({ time: usDateToEpoch(r.d), open, high, low, close, volume: Number(r.v) || 0 });
  }
  return points;
}

/**
 * 美股日线的日期串（"2026-08-07"）转 epoch 秒，取当日 **14:00 UTC**。
 *
 * 不用 00:00 UTC：图表按**本地时区**渲染日期，UTC 零点在西半球会退回前一天。
 * 14:00 UTC 落在美股交易时段内（EDT 10:00 / EST 09:00），从 UTC-13 到 UTC+9
 * 都仍是同一个日历日，也与 Yahoo 用开盘时刻当 bar 时间的口径一致。
 */
function usDateToEpoch(date: string): number {
  return Math.floor(Date.parse(`${date}T14:00:00Z`) / 1000);
}

/**
 * 日线聚合为周/月线：开=首根开，收=末根收，高/低取极值，量求和，时间取**区间首根**
 * （lightweight-charts 与 Yahoo 的 1wk/1mo 都以区间起点为 bar 时间）。
 *
 * `tzOffsetSec` 是**分组用**的时区偏移，不改写 bar 时间本身。必须传对，否则月初会错组：
 * A 股日线打在当日 `00:00+08:00`，即前一日 16:00 UTC——2026-09-01 那根按 UTC 算是
 * 8 月，会被并进上个月。美股日线打在 14:00 UTC、本就落在正确的 UTC 日历日，故传 0。
 */
export function aggregateBars(
  daily: KlinePoint[],
  period: '1w' | '1mo',
  tzOffsetSec = 0,
): KlinePoint[] {
  const keyOf = period === '1mo' ? monthKey : weekKey;
  const out: KlinePoint[] = [];
  // 初值用 null 而非 ''：任何 keyOf 的返回值都不会与它相等，首根必定开新组
  let key: string | null = null;
  for (const bar of daily) {
    const k = keyOf(bar.time + tzOffsetSec);
    if (k !== key) {
      key = k;
      out.push({ ...bar });
      continue;
    }
    const cur = out[out.length - 1];
    cur.high = Math.max(cur.high, bar.high);
    cur.low = Math.min(cur.low, bar.low);
    cur.close = bar.close;
    cur.volume += bar.volume;
  }
  return out;
}

function monthKey(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

/** 周分组键取该周周一的 epoch 日序，跨年也不会把两周并成一周 */
function weekKey(epoch: number): string {
  const days = Math.floor(epoch / 86400);
  // 1970-01-01 是周四，减 3 天让周一对齐到整数边界
  return String(Math.floor((days - 3) / 7));
}

/** 各 range 回溯多少天；'all' 为不截断 */
const RANGE_DAYS: Record<Exclude<KlineRange, 'all' | 'ytd'>, number> = {
  '1d': 1,
  '5d': 5,
  '1m': 31,
  '3m': 92,
  '6m': 183,
  '1y': 366,
  '5y': 1827,
};

/** 数据源返回全量历史，按 range 从尾部截取。now 可注入，便于离线测试 */
export function trimToRange(bars: KlinePoint[], range: KlineRange, now = Date.now()): KlinePoint[] {
  if (range === 'all') return bars;
  const cutoff =
    range === 'ytd'
      ? Math.floor(Date.UTC(new Date(now).getUTCFullYear(), 0, 1) / 1000)
      : Math.floor(now / 1000) - RANGE_DAYS[range] * 86400;
  return bars.filter((b) => b.time >= cutoff);
}

// ───────────────────────── A 股 K 线 ─────────────────────────

/** 北京时区偏移，A 股的日期串与分组都按它算 */
const CN_TZ_OFFSET_SEC = 8 * 3600;

/**
 * 通用周期 → 新浪 scale（分钟数）。新浪没有 1 分钟档，也没有周/月档：
 * 周/月由 240（日线）聚合而来。
 */
const CN_SCALE: Partial<Record<KlinePeriod, number>> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 240,
  '1w': 240,
  '1mo': 240,
};

/** 新浪 A 股支持的周期——缺 1 分钟档，声明支持等于白打一趟 */
export function sinaCnSupportsPeriod(period: KlinePeriod): boolean {
  return CN_SCALE[period] !== undefined;
}

/** 新浪单次返回上限 */
const CN_MAX_BARS = 1023;

/**
 * 拉取 A 股 K 线。排在腾讯、东财**之后**：本接口是**不复权**的，
 * 前两者都给前复权。只在它们都不可达时兜底（东财 push2his 就时常整个挂掉）。
 */
export async function fetchSinaCnKline(
  req: NormalizedRequest,
  deps: KlineSourceDeps = {},
): Promise<KlinePoint[]> {
  const scale = CN_SCALE[req.period];
  if (!scale) throw new Error(`新浪 A 股 K 线不支持周期：${req.period}`);
  const { prefix, code } = parseChinaSymbol(req.rawSymbol);

  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${prefix}${code}&scale=${scale}&ma=no&datalen=${CN_MAX_BARS}`;
  const resp = await fetchWithPolicy(url, { headers: SINA_HEADERS, fetchImpl: deps.fetchImpl });
  if (!resp.ok) throw new Error(`新浪 A 股 K 线 HTTP ${resp.status}`);

  const bars = parseSinaCnKline(await resp.text());
  const shaped =
    req.period === '1w' || req.period === '1mo'
      ? aggregateBars(bars, req.period, CN_TZ_OFFSET_SEC)
      : bars;
  return trimToRange(shaped, req.range);
}

/** 新浪 A 股 K 线单条：day 在日线是 "2026-08-07"、分钟线是 "2026-08-07 14:55:00" */
interface SinaCnKlineRow {
  day?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

/** 与美股日 K 不同，这个接口返回的是裸 JSON 数组，没有 JSONP 外壳 */
export function parseSinaCnKline(raw: string): KlinePoint[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('新浪 A 股 K 线响应不含数组体');

  let rows: SinaCnKlineRow[];
  try {
    rows = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error('新浪 A 股 K 线响应 JSON 解析失败');
  }

  const points: KlinePoint[] = [];
  for (const r of rows) {
    if (!r?.day) continue;
    const open = Number(r.open);
    const high = Number(r.high);
    const low = Number(r.low);
    const close = Number(r.close);
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;
    points.push({
      time: cnDateToEpoch(r.day),
      open,
      high,
      low,
      close,
      volume: Number(r.volume) || 0,
    });
  }
  return points;
}

/** 日期/时间串按北京时区解析，与腾讯、东财两源的口径一致 */
function cnDateToEpoch(day: string): number {
  const iso = day.length === 10 ? `${day}T00:00:00+08:00` : `${day.replace(' ', 'T')}+08:00`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

// ───────────────────────── 报价 ─────────────────────────

/** 新浪报价响应形如 `var hq_str_gb_aapl="字段,字段,...";`，取引号内的载荷 */
function splitSinaQuote(text: string, symbol: string): string[] {
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1]) throw new Error(`新浪报价为空：${symbol}`);
  return m[1].split(',');
}

export async function fetchSinaUsQuote(
  symbol: string,
  deps: KlineSourceDeps = {},
): Promise<RealtimeQuote> {
  const { ticker, isIndex } = parseUsSymbol(symbol);
  // 指数在新浪要写成 gb_$dji，个股则是 gb_aapl。
  // 只编码 ticker：未登记的代码是用户输入、可能带 & ? 之类；而 $ 一旦编成 %24 新浪就返回空串
  const sinaCode = `gb_${isIndex ? '$' : ''}${encodeURIComponent(ticker.toLowerCase())}`;
  const resp = await fetchWithPolicy(`https://hq.sinajs.cn/list=${sinaCode}`, {
    headers: SINA_HEADERS,
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`新浪美股报价 HTTP ${resp.status}`);
  return parseSinaUsQuote(await readGbk(resp), ticker);
}

/**
 * 新浪美股报价字段（0-based）：
 * 0=名称 1=现价 2=涨跌幅% 3=更新时间(北京) 4=涨跌额 5=开盘 6=最高 7=最低
 * 8=52周高 9=52周低 10=成交量(股) 12=总市值 14=PE 21=盘后价 22=盘后涨跌 23=盘后涨跌%
 * 26=昨收 30=成交额
 */
export function parseSinaUsQuote(text: string, ticker: string): RealtimeQuote {
  const f = splitSinaQuote(text, ticker);
  // 31 = 用到的最大下标 f[30]（成交额）+ 1。放松到 27 会让截断的响应静静得出 amount:0
  if (f.length < 31) throw new Error(`新浪美股报价字段不足：${f.length}`);

  const price = Number(f[1]);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`新浪美股报价无效：${ticker}`);
  const prevClose = Number(f[26]) || 0;

  const out: RealtimeQuote = {
    symbol: ticker,
    name: f[0] || ticker,
    price,
    change: Number(Number(f[4]).toFixed(4)) || 0,
    changePercent: Number(Number(f[2]).toFixed(2)) || 0,
    open: Number(f[5]) || 0,
    high: Number(f[6]) || 0,
    low: Number(f[7]) || 0,
    prevClose,
    volume: Number(f[10]) || 0,
    amount: Number(f[30]) || 0,
    pe: positive(f[14]),
    marketCap: positive(f[12]),
    high52w: positive(f[8]),
    low52w: positive(f[9]),
    // 字段 3 是北京时间挂钟串、不带时区偏移，硬解会在非 +08:00 的机器上整体偏移；
    // 且本源本就是延迟行情，取抓取时刻已足够表达「这份报价有多新」
    timestamp: Math.floor(Date.now() / 1000),
    currency: 'USD',
    market: '美股',
  };

  const postPrice = positive(f[21]);
  if (postPrice != null) {
    out.postMarket = {
      price: postPrice,
      change: Number(f[22]) || 0,
      changePercent: Number(f[23]) || 0,
    };
  }
  return out;
}

export async function fetchSinaCnQuote(
  symbol: string,
  deps: KlineSourceDeps = {},
): Promise<RealtimeQuote> {
  const { prefix, code } = parseChinaSymbol(symbol);
  const sinaCode = `${prefix}${code}`;
  const resp = await fetchWithPolicy(`https://hq.sinajs.cn/list=${sinaCode}`, {
    headers: SINA_HEADERS,
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`新浪 A 股报价 HTTP ${resp.status}`);
  return parseSinaCnQuote(await readGbk(resp), sinaCode);
}

/**
 * 新浪 A 股报价字段（0-based）：
 * 0=名称 1=今开 2=昨收 3=现价 4=最高 5=最低 8=成交量(股) 9=成交额(元)
 * 10..29=五档买卖 30=日期 31=时间
 *
 * 比腾讯少了 PE / PB / 换手率 / 市值——本源是腾讯挂掉时的兜底，缺的字段留空由上层容错，
 * 不去另拼一个接口把它补齐（那等于为兜底路径再造一条主链路）。
 */
export function parseSinaCnQuote(text: string, symbol: string): RealtimeQuote {
  const f = splitSinaQuote(text, symbol);
  if (f.length < 32) throw new Error(`新浪 A 股报价字段不足：${f.length}`);

  const price = Number(f[3]);
  const prevClose = Number(f[2]) || 0;
  if (!Number.isFinite(price) || price <= 0) throw new Error(`新浪 A 股报价无效：${symbol}`);

  const change = price - prevClose;
  return {
    symbol,
    name: f[0] || symbol,
    price,
    change: Number(change.toFixed(3)),
    changePercent: prevClose ? Number(((change / prevClose) * 100).toFixed(2)) : 0,
    open: Number(f[1]) || 0,
    high: Number(f[4]) || 0,
    low: Number(f[5]) || 0,
    prevClose,
    volume: Number(f[8]) || 0,
    amount: Number(f[9]) || 0,
    timestamp: Math.floor(new Date(`${f[30]}T${f[31]}+08:00`).getTime() / 1000),
    currency: 'CNY',
    market: 'A股',
  };
}

/** 新浪把「无此字段」写成 0，直接透传会让 PE=0、市值=0 这类假值上屏 */
function positive(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
