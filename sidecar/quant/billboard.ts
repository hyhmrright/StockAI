import { tmpdir } from 'os';
import * as path from 'path';
import type { Billboard, BillboardEntry } from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { fetchWithPolicy } from '../http';

/**
 * 龙虎榜（东财 datacenter `RPT_DAILYBILLBOARD_DETAILSNEW`）。
 *
 * 两个必须绕开的坑：
 *
 * 1. **必须显式定交易日**。该 report 是全历史表（实测 pages≈8.8 万），不带
 *    `filter` 时默认排序会返回 2015 年的数据。所以先探一次最新 TRADE_DATE，
 *    再按该日过滤。
 * 2. **不按股票去重**。同一只股票同日触发多个上榜标准会各出一条，且净额按
 *    各自的统计窗口算、彼此不等（实测 000603 同日 +1.13 亿 / −0.29 亿：前者
 *    是「连续三日累计」窗口，后者是「当日偏离」窗口）。把两者并成一个数字
 *    等于编一个交易所没有披露过的值，所以保留原始记录、各自带上榜原因。
 *
 * 买卖两榜分别用 sortTypes=-1/1 各取一页，而不是取一大页在本地切头尾——
 * 后者在极端行情（上榜数超过页容量）会静默截断卖出榜。
 */

/**
 * 探日期必须先于两榜完成，所以这条链路是**两轮串行 RTT、共三发请求**，轮数由数据依赖
 * 决定、压不掉；而 datacenter 是本仓最慢的端点，实测 2.3s / 7.5s / 8.1s(超时失败)，三次里挂一次。
 * 能省的只有重复访问：面板按页签条件挂载（`useAsyncOnce` 挂载即取），
 * 关掉弹窗再打开、来回切页签都会重新走一遍全程。
 *
 * TTL 取 30 分钟而非邻居们的 24h：龙虎榜虽是「T 日收盘后发布、当日不再变」的日频数据，
 * 但**发布时刻不固定**，24h 会让当天的新榜迟迟不出现。30 分钟覆盖了一次使用会话内的
 * 反复开关（真正的重复来源），代价上限只是新榜延迟半小时。
 */
const BILLBOARD_CACHE_OPTS: CacheOptions = {
  // 独立目录不是可有可无的：maxEntries 修剪的是「目录里的文件数」，与邻居共用根目录时
  // 配额最小的那个说了算——实测本模块（4 条）写一次，会把默认目录裁到 4 个文件、
  // 连带删掉 7 条深度分析结果（每条代表 15 次 LLM 调用）。同 f10 / 财报历史 / 全市场快照的做法。
  dir: path.join(tmpdir(), 'stockai-billboard-cache'),
  ttlMs: 30 * 60_000,
  maxEntries: 4, // 无参数、只有一个 key，保守即可
};

const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const REPORT = 'RPT_DAILYBILLBOARD_DETAILSNEW';
const COLUMNS = [
  'SECURITY_CODE',
  'SECURITY_NAME_ABBR',
  'TRADE_DATE',
  'CLOSE_PRICE',
  'CHANGE_RATE',
  'BILLBOARD_NET_AMT',
  'BILLBOARD_BUY_AMT',
  'BILLBOARD_SELL_AMT',
  'ACCUM_AMOUNT',
  'DEAL_NET_RATIO',
  'EXPLANATION',
].join(',');

/** 买卖两榜各取多少条。榜单看的是头部，全量几十上百条在弹窗里读不完。 */
export const BILLBOARD_TOP_N = 10;

interface BillboardRow {
  SECURITY_CODE?: string;
  SECURITY_NAME_ABBR?: string;
  TRADE_DATE?: string;
  CLOSE_PRICE?: number | null;
  CHANGE_RATE?: number | null;
  BILLBOARD_NET_AMT?: number | null;
  BILLBOARD_BUY_AMT?: number | null;
  BILLBOARD_SELL_AMT?: number | null;
  ACCUM_AMOUNT?: number | null;
  DEAL_NET_RATIO?: number | null;
  EXPLANATION?: string | null;
}

interface BillboardResponse {
  result?: { data?: BillboardRow[] | null } | null;
}

/** 东财对缺失值返回 null/"-"，统一收敛为 0（榜单的金额缺失即视为 0） */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** `"2026-08-07 00:00:00"` → `"2026-08-07"`；取不到日期的行由调用方过滤 */
export function toTradeDate(raw: string | null | undefined): string {
  return (raw ?? '').slice(0, 10);
}

function buildUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({
    reportName: REPORT,
    columns: COLUMNS,
    source: 'WEB',
    client: 'WEB',
    ...params,
  });
  return `${API}?${qs}`;
}

/** 探最新交易日：按 TRADE_DATE 降序取 1 条 */
export function buildLatestDateUrl(): string {
  return buildUrl({
    pageNumber: '1',
    pageSize: '1',
    sortColumns: 'TRADE_DATE',
    sortTypes: '-1',
  });
}

/** 某交易日的榜单一页。`desc=true` 为净买入榜，`false` 为净卖出榜。 */
export function buildBillboardUrl(tradeDate: string, desc: boolean, top = BILLBOARD_TOP_N): string {
  return buildUrl({
    pageNumber: '1',
    pageSize: String(top),
    sortColumns: 'BILLBOARD_NET_AMT',
    sortTypes: desc ? '-1' : '1',
    filter: `(TRADE_DATE='${tradeDate}')`,
  });
}

/** 纯解析：一页榜单响应 → BillboardEntry[]（跳过无代码的脏行） */
export function parseBillboardPage(json: BillboardResponse): BillboardEntry[] {
  const rows = json?.result?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => !!r?.SECURITY_CODE)
    .map((r) => ({
      symbol: r.SECURITY_CODE as string,
      name: r.SECURITY_NAME_ABBR ?? '',
      price: num(r.CLOSE_PRICE),
      changePercent: num(r.CHANGE_RATE),
      netAmount: num(r.BILLBOARD_NET_AMT),
      buyAmount: num(r.BILLBOARD_BUY_AMT),
      sellAmount: num(r.BILLBOARD_SELL_AMT),
      turnover: num(r.ACCUM_AMOUNT),
      netRatio: num(r.DEAL_NET_RATIO),
      reason: r.EXPLANATION ?? '',
    }));
}

export interface BillboardDeps {
  fetchImpl?: typeof fetch;
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
}

async function getJson(url: string, deps: BillboardDeps): Promise<BillboardResponse> {
  const resp = await fetchWithPolicy(url, {
    headers: { Referer: 'https://data.eastmoney.com/' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`东财龙虎榜 HTTP ${resp.status}`);
  return (await resp.json()) as BillboardResponse;
}

/** 拉取最新交易日的龙虎榜（净买入榜 + 净卖出榜） */
export async function fetchBillboard(deps: BillboardDeps = {}): Promise<Billboard> {
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;

  const key = cacheKey(['billboard', 'v1']);
  const cached = _readCache<Billboard>(key, BILLBOARD_CACHE_OPTS);
  if (cached) return cached;

  const probe = await getJson(buildLatestDateUrl(), deps);
  const tradeDate = toTradeDate(probe?.result?.data?.[0]?.TRADE_DATE);
  if (!tradeDate) throw new Error('东财龙虎榜未返回交易日');

  const [buyPage, sellPage] = await Promise.all([
    getJson(buildBillboardUrl(tradeDate, true), deps),
    getJson(buildBillboardUrl(tradeDate, false), deps),
  ]);

  // 按符号过滤：上榜数不足 TOP_N 时，降序页的尾部会是净卖出记录（升序页同理）。
  // 不滤掉的话「净买入榜」里会混进净卖出的股票，标题与数字直接打架。
  const result: Billboard = {
    tradeDate,
    topBuy: parseBillboardPage(buyPage).filter((e) => e.netAmount > 0),
    topSell: parseBillboardPage(sellPage).filter((e) => e.netAmount < 0),
    fetchedAt: Date.now(),
  };

  // 两榜皆空不写缓存：那多半是上游抽风而非「今天没人上榜」，
  // 缓存下来会把一次偶发失败固化成半小时的空榜。照常返回，只是下次仍会重试。
  if (result.topBuy.length + result.topSell.length > 0) {
    _writeCache(key, result, BILLBOARD_CACHE_OPTS);
  }
  return result;
}
