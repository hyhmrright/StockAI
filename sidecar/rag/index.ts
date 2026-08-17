import { tmpdir } from 'os';
import * as path from 'path';
import type { ReportChunk } from '../../shared/types';
import { detectMarket } from '../../shared/market';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { toErrorMessage } from '../utils';
import { logger } from '../log';
import { resolveSseUid, fetchSseFeeds } from './sse';
import { resolveCompanyName } from './company-name';
import { searchIrmQa } from './irm';
import { buildIndex, query } from './bm25';
import type { ReportIndexFile } from './types';

/**
 * RAG 编排层：唯一 IO 入口。按沪深市场路由到对应交易所官方互动平台 → BM25 建索引 → 磁盘缓存，
 * 对外只暴露 `ensureReportIndex` / `retrieveReportChunks`。
 *
 * 沪市(6/9开头)→ 上证e互动（sse.ts）；深市 → 深交所互动易（irm.ts，需先查公司简称）。
 * 弃用巨潮 PDF 公告方案：「投资者关系活动记录表」对沪市几乎 0 命中，fallback 拿到的也只是
 * 空洞的会议通知，无实质问答；交易所官方互动平台内容为真实 Q&A，且沪深两市均有覆盖。
 *
 * 硬约束遵守：索引落 sidecar 专属 cache 目录（stockai-report-index-cache），与前端 history.db 物理隔离；
 * 按 symbol 一份、24h TTL（互动问答更新较财报频繁，但仍按天级缓存足够）。绝不 import config/apiKey。
 * 哲学同 cache.ts：RAG 永不阻断 chat——任何异常吞掉返回 []/null。
 */

const REPORT_CACHE_OPTS: CacheOptions = {
  dir: path.join(tmpdir(), 'stockai-report-index-cache'),
  ttlMs: 24 * 3600_000,
  maxEntries: 500,
};

/** 单次拉取的问答条数上限：控制冷启动耗时 + 注入 token */
const FEED_PAGE_SIZE = 10;

/**
 * 沪市：6/9 开头（900 为沪市 B 股，走同一平台）。
 * 北交所新代码段 92x 恰以 9 开头会被误判为沪市，误路由到上证e互动——该平台无此公司会
 * 优雅退化为 null（不崩、不误注入），故不影响正确性；初版未单独适配北交所，留作已知限制。
 */
function isShanghai(code: string): boolean {
  return /^[69]/.test(code);
}

/**
 * 全部注入点：使 index.test.ts 可完全 hermetic（不打网络、不落盘）。
 * fetchImpl 透传给 sse/irm/company-name 各模块（未提供各自 xxxImpl 时，其内部走真实网络函数）。
 */
export interface ReportIndexDeps {
  fetchImpl?: typeof fetch;
  resolveSseUidImpl?: typeof resolveSseUid;
  fetchSseFeedsImpl?: typeof fetchSseFeeds;
  resolveCompanyNameImpl?: typeof resolveCompanyName;
  searchIrmQaImpl?: typeof searchIrmQa;
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
}

/**
 * 命中 24h 磁盘缓存直接返回；miss 则按沪深路由抓取交易所官方互动问答 → 建 BM25 索引落盘。
 * 非 A 股 / 该平台无此公司 / 零问答 → 返回 null（不抛、不缓存空结果）。
 */
export async function ensureReportIndex(
  symbol: string,
  deps: ReportIndexDeps = {},
): Promise<ReportIndexFile | null> {
  const _resolveSseUid = deps.resolveSseUidImpl ?? resolveSseUid;
  const _fetchSseFeeds = deps.fetchSseFeedsImpl ?? fetchSseFeeds;
  const _resolveCompanyName = deps.resolveCompanyNameImpl ?? resolveCompanyName;
  const _searchIrmQa = deps.searchIrmQaImpl ?? searchIrmQa;
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;

  // 初版仅 A 股：非 A 股 / 非 6 位代码直接放弃
  const cleaned = symbol.replace(/\D/g, '');
  if (detectMarket(symbol) !== 'A股' || !/^\d{6}$/.test(cleaned)) return null;

  const key = cacheKey(['report-index', cleaned]);
  const cached = _readCache<ReportIndexFile>(key, REPORT_CACHE_OPTS);
  if (cached) return cached;

  let chunks: ReportChunk[];
  if (isShanghai(cleaned)) {
    const uid = await _resolveSseUid(cleaned, deps);
    if (!uid) {
      logger.warn(`RAG: 上证e互动 uid 解析失败，跳过建索引 (${symbol})`);
      return null;
    }
    chunks = await _fetchSseFeeds(cleaned, uid, FEED_PAGE_SIZE, deps);
  } else {
    const name = await _resolveCompanyName(cleaned, deps);
    if (!name) {
      logger.warn(`RAG: 公司简称解析失败，跳过建索引 (${symbol})`);
      return null;
    }
    chunks = await _searchIrmQa(cleaned, name, FEED_PAGE_SIZE, deps);
  }

  if (chunks.length === 0) {
    logger.warn(`RAG: 无投资者互动问答 (${symbol})`);
    return null;
  }

  const index = buildIndex(cleaned, chunks);
  // 仅在拿到 chunk 时写缓存，避免把偶发空结果缓存 24h
  _writeCache(key, index, REPORT_CACHE_OPTS);
  logger.info(`RAG: 建索引完成 (${symbol})，${chunks.length} 条问答`);
  return index;
}

/**
 * 对某股票的追问检索 top-K 投资者互动问答片段（带来源元信息）。
 * ensureReportIndex → BM25 query → 取回 chunk。任何异常吞掉返回 []（RAG 永不阻断 chat）。
 * 非 A 股 / 无索引 / 无相关 chunk → 返回 []（chat 优雅退化，无 report 角标）。
 */
export async function retrieveReportChunks(
  symbol: string,
  question: string,
  k = 4,
  deps: ReportIndexDeps = {},
): Promise<ReportChunk[]> {
  try {
    const index = await ensureReportIndex(symbol, deps);
    if (!index) return [];
    const hits = query(index, question, k);
    return hits.map((h) => index.chunks[h.chunkIndex]).filter((c): c is ReportChunk => !!c);
  } catch (err) {
    logger.warn(`RAG: 检索失败，退化为无 report 上下文 (${symbol}): ${toErrorMessage(err)}`);
    return [];
  }
}
