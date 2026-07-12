import { tmpdir } from 'os';
import * as path from 'path';
import type { FinancialHistory, FinancialSnapshot } from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { detectMarket } from '../../shared/market';
import { logger, toErrorMessage } from '../utils';
import { annualizeRoe } from './roe-annualize';

/**
 * 历史财务时序（东财 F10 RPT_F10_FINANCE_MAINFINADATA）。
 *
 * 设计要点（见蓝图 §2）：
 * - 数据源单只股票即有 100+ 期历史（600519 回溯到 1998），故「按需拉取」而非「渐进积累」。
 * - 消费者（#12 因子预计算 / #11 RAG 数值溯源）跑在 sidecar，读不到前端 SQLite，
 *   因此不建持久化表，复用 sidecar 磁盘缓存（cache.ts）落盘，24h TTL。
 * - 纯解析 parseEastmoneyFinancialHistory 与网络层解耦，离线可测。
 */

// 与 10 分钟分析缓存隔离：财报按季变更，TTL 拉长到 24h；条目上限调高避免全市场预计算时 LRU 抖动
const FIN_CACHE_OPTS: CacheOptions = {
  dir: path.join(tmpdir(), 'stockai-financials-cache'),
  ttlMs: 24 * 3600_000,
  maxEntries: 5000,
};

/** 东财 F10 一行原始字段（仅列出本模块消费的列，均可能缺失） */
interface EastmoneyFinancialRow {
  REPORT_DATE?: string;
  REPORT_TYPE?: string;
  ROEJQ?: number;
  XSMLL?: number;
  XSJLL?: number;
  ZCFZL?: number;
  LD?: number;
  TOTALOPERATEREVETZ?: number;
  PARENTNETPROFITTZ?: number;
  TOTALOPERATEREVE?: number;
  PARENTNETPROFIT?: number;
  EPSJB?: number;
  BPS?: number;
  MGJYXJJE?: number;
}

/**
 * 东财 datacenter F10 响应：数据在 result.data；
 * 字段名失效/参数错误时返回 { success:false, result:null, code:9501 }。
 */
interface EastmoneyF10HistoryResponse {
  result?: { data?: EastmoneyFinancialRow[] } | null;
  success?: boolean;
  message?: string;
}

/** F10 请求列（顺序与解析无关，但保持与 columns 查询串一致便于核对） */
const F10_COLUMNS =
  'SECURITY_CODE,REPORT_DATE,REPORT_TYPE,ROEJQ,XSJLL,XSMLL,ZCFZL,LD,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,PARENTNETPROFIT,TOTALOPERATEREVE,EPSJB,BPS,MGJYXJJE';

/** 数值字段安全取值：仅接受有限数，其余（null/undefined/"-"）→ undefined */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * 纯解析：东财 F10 响应 → FinancialSnapshot[]（按 reportDate 降序，源已排好序原样保留）。
 * success:false 或无数据 → 返回空数组（不抛出，交由上层降级）。
 */
export function parseEastmoneyFinancialHistory(
  json: EastmoneyF10HistoryResponse,
): FinancialSnapshot[] {
  if (json?.success === false) {
    logger.warn(`东财 F10 历史返回失败: ${json.message ?? '未知原因'}`);
    return [];
  }
  const rows = json?.result?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => !!r?.REPORT_DATE)
    .map((r) => ({
      // "2026-03-31 00:00:00" → "2026-03-31"（仅保留日期部分）
      reportDate: (r.REPORT_DATE as string).slice(0, 10),
      reportType: r.REPORT_TYPE ?? '',
      // 非年报期为累计值，年化后与年报同口径可比（年报本身乘数为 1，含 §12 因子预计算在内的
      // 消费者不受影响——computeFactors 只筛年报子序列）
      roe: annualizeRoe(num(r.ROEJQ), r.REPORT_TYPE),
      grossMargin: num(r.XSMLL),
      netMargin: num(r.XSJLL),
      debtToAsset: num(r.ZCFZL),
      currentRatio: num(r.LD),
      revenueGrowth: num(r.TOTALOPERATEREVETZ),
      netIncomeGrowth: num(r.PARENTNETPROFITTZ),
      revenue: num(r.TOTALOPERATEREVE),
      netIncome: num(r.PARENTNETPROFIT),
      eps: num(r.EPSJB),
      bps: num(r.BPS),
      operatingCashFlowPerShare: num(r.MGJYXJJE),
    }));
}

/** 构造东财 F10 历史请求 URL（columns 用新字段名；filter 内引号需保留，fetch 会编码） */
export function buildF10HistoryUrl(code: string, periods: number): string {
  const columns = encodeURIComponent(F10_COLUMNS);
  const filter = encodeURIComponent(`(SECURITY_CODE="${code}")`);
  return (
    'https://datacenter-web.eastmoney.com/api/data/v1/get' +
    `?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=${columns}` +
    `&filter=${filter}&pageSize=${periods}&sortColumns=REPORT_DATE&sortTypes=-1`
  );
}

export interface FinancialHistoryDeps {
  fetchImpl?: typeof fetch;
  // 缓存读写默认走 cache.ts；测试注入空实现以保持离线 hermetic，不落盘
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
}

/**
 * 按需拉取历史财务时序（默认 12 期）。仅支持 A 股；命中 24h 磁盘缓存即返回。
 * 批量场景（#12 全市场预计算）须由调用方串行 + 抖动，勿并发裸打东财。
 */
export async function fetchFinancialHistory(
  symbol: string,
  periods = 12,
  deps: FinancialHistoryDeps = {},
): Promise<FinancialHistory> {
  const _fetch = deps.fetchImpl ?? fetch;
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;

  const market = detectMarket(symbol);
  const cleaned = symbol.replace(/\D/g, '');
  if (market !== 'A股' || !/^\d{6}$/.test(cleaned)) {
    // 初版仅 A 股：非 A 股/无效代码返回空时序（不抛出，下游 guard 空数组即可）
    return { symbol, market, snapshots: [], fetchedAt: Date.now() };
  }

  const key = cacheKey(['fin-history', cleaned, periods]);
  const cached = _readCache<FinancialHistory>(key, FIN_CACHE_OPTS);
  if (cached) return cached;

  const url = buildF10HistoryUrl(cleaned, periods);
  const resp = await _fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`东财 F10 历史 HTTP ${resp.status}`);
  const json = (await resp.json()) as EastmoneyF10HistoryResponse;
  const snapshots = parseEastmoneyFinancialHistory(json);

  const result: FinancialHistory = { symbol, market, snapshots, fetchedAt: Date.now() };
  // 仅在拿到数据时写缓存，避免把偶发空结果缓存 24h
  if (snapshots.length > 0) _writeCache(key, result, FIN_CACHE_OPTS);
  else logger.warn(`历史财务为空 (${symbol})：${toErrorMessage(json?.message ?? 'no data')}`);
  return result;
}
