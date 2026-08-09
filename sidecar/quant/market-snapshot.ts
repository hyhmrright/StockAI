import { tmpdir } from 'os';
import * as path from 'path';
import type { MarketSnapshot, MarketSnapshotEntry } from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { HTTP_DEFAULTS } from '../config';
import { fetchWithPolicy } from '../http';
import { logger, toErrorMessage } from '../utils';
import { extractSinaJson } from '../parsers/sina-envelope';

/**
 * 全市场基本面快照（东财 push2 clist 分页 list 端点）。
 *
 * 设计要点（见蓝图 §3）：
 * - 用一个分页 list 端点一次拉全市场（沪深主板+创业板+科创板+北交所，实测 total≈5874），
 *   而非逐股 F10 × ~5000 次（必被封 + 数分钟）。
 * - clist 仅可靠携带估值+行情（PE/PB/市值/涨跌/换手）；ROE/负债率/增速等深层财报字段
 *   留给「候选精拉」阶段（--quant / --fundamentals-history），即两阶段筛选。
 * - 分页串行 + 页间随机抖动，避免高频批量触发反爬；结果 24h 磁盘缓存。
 * - 纯解析 parseClistPage 与网络层解耦，离线可测。
 *
 * host 选择：实测 push2.eastmoney.com 偶发 502，push2delay.eastmoney.com（延迟行情，
 * schema 完全一致）稳定可用。快照按 24h 缓存、消费方是基本面粗筛，延迟行情完全够用。
 */

// 全市场快照按 24h 缓存；当前仅一个 key（无 filter，筛选在下游 #14），maxEntries 保守即可
const SNAPSHOT_CACHE_OPTS: CacheOptions = {
  dir: path.join(tmpdir(), 'stockai-market-snapshot-cache'),
  ttlMs: 24 * 3600_000,
  maxEntries: 4,
};

// 沪市主板(m:1 t:2) + 沪市科创板(m:1 t:23) + 深市主板(m:0 t:6) + 创业板(m:0 t:80) + 北交所(m:0 t:81 s:2048)
const MARKET_FS = 'm:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048';
// f12=代码 f14=名称 f2=最新价 f3=涨跌幅 f9=动态PE f23=PB f20=总市值 f8=换手率
const CLIST_FIELDS = 'f12,f14,f2,f3,f9,f23,f20,f8';
const PAGE_SIZE = 100;
// 安全上限：防 total 异常时死循环（5874/100≈59 页，200 页留足冗余）
const MAX_PAGES = 200;

/** 东财 clist 一行原始字段（fltt=2&invt=2 下数值为纯数字；缺失值可能为 "-"） */
interface ClistRow {
  f12?: string; // 代码
  f14?: string; // 名称
  f2?: number | string; // 最新价
  f3?: number | string; // 涨跌幅(%)
  f9?: number | string; // 动态市盈率
  f23?: number | string; // 市净率
  f20?: number | string; // 总市值(元)
  f8?: number | string; // 换手率(%)
}

interface ClistResponse {
  data?: { total?: number; diff?: ClistRow[] } | null;
}

/** 数值安全取值：东财对缺失值返回 "-"/null，统一收敛为 undefined（仅接受有限数） */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 纯解析：东财 clist 一页响应 → MarketSnapshotEntry[]（跳过无代码的脏行） */
export function parseClistPage(json: ClistResponse): MarketSnapshotEntry[] {
  const rows = json?.data?.diff;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => !!r?.f12)
    .map((r) => ({
      symbol: r.f12 as string,
      name: r.f14 ?? '',
      price: num(r.f2),
      changePercent: num(r.f3),
      pe: num(r.f9),
      pb: num(r.f23),
      marketCap: num(r.f20),
      turnoverRate: num(r.f8),
    }));
}

/** 构造东财 clist 分页请求 URL（fltt=2&invt=2 令数值为纯数字；fid=f12 按代码稳定排序便于分页） */
export function buildClistUrl(pn: number, pz = PAGE_SIZE): string {
  // 东财 fs 需要字面 ':'/','，空格用 '+'（实测 encodeURIComponent 会把 ':'→%3A 导致过滤失效、返回全部 5.8w 证券含板块指数）
  const fs = MARKET_FS.replace(/ /g, '+');
  return (
    'https://push2delay.eastmoney.com/api/qt/clist/get' +
    `?pn=${pn}&pz=${pz}&po=1&np=1&fltt=2&invt=2&fid=f12&fs=${fs}&fields=${CLIST_FIELDS}`
  );
}

// ─────────────────── 新浪备源 ───────────────────

/**
 * 东财 push2delay 也挂掉时的兜底（push2 家族 2026-08-09 整体故障过一轮）。
 *
 * 覆盖面略窄：新浪 hs_a 节点实测 5538 只，东财约 5874——差在退市整理、少数 B 股之类，
 * 对「基本面粗筛」这个消费场景无实质影响。
 */
const SINA_NODE_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php';

export function buildSinaSnapshotUrl(page: number, num = PAGE_SIZE): string {
  // sort=symbol&asc=1 = 按代码稳定排序，分页才不会漏行重行
  return `${SINA_NODE_URL}/Market_Center.getHQNodeData?page=${page}&num=${num}&sort=symbol&asc=1&node=hs_a`;
}

/** 新浪快照一行。数值型字段是 number，价格类是字符串——两种都要能吃 */
interface SinaNodeRow {
  code?: string;
  name?: string;
  trade?: string | number;
  changepercent?: number | string;
  per?: number | string;
  pb?: number | string;
  mktcap?: number | string; // 单位**万元**（工商银行实测 268373911 万 = 2.68 万亿）
  turnoverratio?: number | string;
}

/** 与东财那支的 num() 不同：新浪把价格类字段给成字符串，只认 number 会全部丢成 undefined */
function loose(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 纯解析：新浪一页响应 → MarketSnapshotEntry[]（响应是带 \u 转义的纯 JSON，无需 GBK 解码） */
export function parseSinaSnapshotPage(raw: string): MarketSnapshotEntry[] {
  const rows = extractSinaJson<SinaNodeRow[]>(raw, '[');
  if (!rows) return [];

  return rows
    .filter((r) => !!r?.code)
    .map((r) => {
      const capWan = loose(r.mktcap);
      return {
        symbol: r.code as string,
        name: r.name ?? '',
        price: loose(r.trade),
        changePercent: loose(r.changepercent),
        pe: loose(r.per),
        pb: loose(r.pb),
        // 万元 → 元，与东财 f20 的口径对齐；忘了换算会让下游按市值筛选整体差 1 万倍
        marketCap: capWan === undefined ? undefined : capWan * 1e4,
        turnoverRate: loose(r.turnoverratio),
      };
    });
}

export interface MarketSnapshotDeps {
  fetchImpl?: typeof fetch;
  // 缓存读写默认走 cache.ts；测试注入以保持离线 hermetic
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
  // 页间抖动；测试注入 no-op 以免拖慢
  sleepImpl?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Sleeper = (ms: number) => Promise<void>;
interface Paged {
  entries: MarketSnapshotEntry[];
  total: number;
}

/**
 * 分页串行拉取的公共骨架。两个源只在「URL 怎么拼、响应怎么解析、总数从哪来」上不同，
 * 而翻页、抖动、空页停止、页数上限这些是一样的。
 *
 * 页间 120–300ms 随机抖动，避免高频批量触发反爬。
 */
async function fetchPaged(
  sleepImpl: Sleeper,
  page: (pn: number) => Promise<{ rows: MarketSnapshotEntry[]; total?: number }>,
): Promise<Paged> {
  const entries: MarketSnapshotEntry[] = [];
  let total = 0;
  for (let pn = 1; pn <= MAX_PAGES; pn++) {
    const { rows, total: t } = await page(pn);
    if (pn === 1 && t) total = t;
    if (rows.length === 0) break; // 空页（末页或 total 不准）即结束
    entries.push(...rows);
    if (total > 0 && entries.length >= total) break; // 已拉全
    await sleepImpl(120 + Math.floor(Math.random() * 180));
  }
  return { entries, total };
}

/** 东财：首选源，字段与下游口径原生一致 */
export function fetchEastmoneySnapshot(
  deps: MarketSnapshotDeps = {},
  sleepImpl: Sleeper = sleep,
): Promise<Paged> {
  return fetchPaged(sleepImpl, async (pn) => {
    // 分页聚合是重接口，用放宽超时
    const resp = await fetchWithPolicy(buildClistUrl(pn), {
      timeoutMs: HTTP_DEFAULTS.slowTimeoutMs,
      fetchImpl: deps.fetchImpl,
    });
    if (!resp.ok) throw new Error(`东财 clist HTTP ${resp.status}`);
    const json = (await resp.json()) as ClistResponse;
    return { rows: parseClistPage(json), total: num(json?.data?.total) };
  });
}

/** 新浪：备源。总数另有端点，这里不取——靠空页停止即可，少打一次请求 */
export function fetchSinaSnapshot(
  deps: MarketSnapshotDeps = {},
  sleepImpl: Sleeper = sleep,
): Promise<Paged> {
  return fetchPaged(sleepImpl, async (pn) => {
    const resp = await fetchWithPolicy(buildSinaSnapshotUrl(pn), {
      timeoutMs: HTTP_DEFAULTS.slowTimeoutMs,
      headers: { Referer: 'https://finance.sina.com.cn' },
      fetchImpl: deps.fetchImpl,
    });
    if (!resp.ok) throw new Error(`新浪全市场快照 HTTP ${resp.status}`);
    return { rows: parseSinaSnapshotPage(await resp.text()) };
  });
}

/**
 * 拉取全市场基本面快照。命中 24h 磁盘缓存即返回；否则分页串行拉 clist 累加。
 * 页间加 120–300ms 随机抖动，避免高频批量触发反爬（研究风控提示）。
 */
export async function fetchMarketSnapshot(deps: MarketSnapshotDeps = {}): Promise<MarketSnapshot> {
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;
  const _sleep = deps.sleepImpl ?? sleep;

  const key = cacheKey(['market-snapshot', 'v1']);
  const cached = _readCache<MarketSnapshot>(key, SNAPSHOT_CACHE_OPTS);
  if (cached) return cached;

  let entries: MarketSnapshotEntry[];
  let total: number;
  try {
    ({ entries, total } = await fetchEastmoneySnapshot(deps, _sleep));
  } catch (err) {
    logger.warn(`东财全市场快照失败，回退新浪：${toErrorMessage(err)}`);
    ({ entries, total } = await fetchSinaSnapshot(deps, _sleep));
  }

  const result: MarketSnapshot = { entries, fetchedAt: Date.now(), total: total || entries.length };
  // 仅在拿到数据时写缓存，避免把偶发空结果缓存 24h
  if (entries.length > 0) _writeCache(key, result, SNAPSHOT_CACHE_OPTS);
  else logger.warn('全市场快照为空：clist 未返回任何标的');
  return result;
}
