import { tmpdir } from 'os';
import * as path from 'path';
import type { MarketSnapshot, MarketSnapshotEntry } from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { HTTP_DEFAULTS } from '../config';
import { fetchWithPolicy } from '../http';
import { logger } from '../utils';

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

export interface MarketSnapshotDeps {
  fetchImpl?: typeof fetch;
  // 缓存读写默认走 cache.ts；测试注入以保持离线 hermetic
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
  // 页间抖动；测试注入 no-op 以免拖慢
  sleepImpl?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

  const entries: MarketSnapshotEntry[] = [];
  let total = 0;
  for (let pn = 1; pn <= MAX_PAGES; pn++) {
    // 分页聚合是重接口，用放宽超时
    const resp = await fetchWithPolicy(buildClistUrl(pn), {
      timeoutMs: HTTP_DEFAULTS.slowTimeoutMs,
      fetchImpl: deps.fetchImpl,
    });
    if (!resp.ok) throw new Error(`东财 clist HTTP ${resp.status}`);
    const json = (await resp.json()) as ClistResponse;
    // 首页取 total 用于判断是否已拉全（东财声明的全市场标的总数）
    if (pn === 1) total = num(json?.data?.total) ?? 0;
    const page = parseClistPage(json);
    if (page.length === 0) break; // 空页（末页或 total 不准）即结束
    entries.push(...page);
    if (total > 0 && entries.length >= total) break; // 已拉全
    await _sleep(120 + Math.floor(Math.random() * 180)); // 120–300ms 抖动
  }

  const result: MarketSnapshot = { entries, fetchedAt: Date.now(), total: total || entries.length };
  // 仅在拿到数据时写缓存，避免把偶发空结果缓存 24h
  if (entries.length > 0) _writeCache(key, result, SNAPSHOT_CACHE_OPTS);
  else logger.warn('全市场快照为空：clist 未返回任何标的');
  return result;
}
