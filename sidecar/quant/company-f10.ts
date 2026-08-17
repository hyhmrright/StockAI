import { tmpdir } from 'os';
import * as path from 'path';
import type {
  BusinessSegment,
  CompanyF10,
  CompanyOverview,
  SegmentDimension,
  Shareholding,
  TopHolder,
} from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { fetchWithPolicy } from '../http';
import { toErrorMessage } from '../utils';
import { logger } from '../log';

/**
 * 公司基本资料 F10（东财 emweb `PC_HSF10/*\/PageAjax`）。
 *
 * **仅 A 股**：数据源是沪深北交易所的 F10 披露，美股无对应形态（美股的同类信息
 * 由 Yahoo quoteSummary 走 `fundamental.ts`）。调用方需自行按市场判断是否调用。
 *
 * 四个端点各自独立成因（概况 / 主营构成 / 股东 / 所属板块），故用 allSettled 并发：
 * 缺一块不影响其余，UI 按有无分别渲染。这与 `sectors.ts` 的「一张失败即整体失败」
 * 是有意的差别——板块榜的两张表合起来才是一个完整的市场横截面，少一半会误导
 * 「今天只有行业在动」；而 F10 的四块是彼此无关的事实，少一块不会让另一块变得不准。
 *
 * 结果 24h 磁盘缓存：F10 按季更新，同一只股票一天内反复看不该反复打四发请求。
 */

const F10_CACHE_OPTS: CacheOptions = {
  dir: path.join(tmpdir(), 'stockai-company-f10-cache'),
  ttlMs: 24 * 3600_000,
  maxEntries: 2000,
};

const BASE = 'https://emweb.securities.eastmoney.com/PC_HSF10';

/** 东财 emweb 的 code 参数形如 `SH600519`；前缀由 detectChinaStock 给出 */
export function buildF10Url(page: string, prefixedCode: string): string {
  return `${BASE}/${page}/PageAjax?code=${prefixedCode}`;
}

/** 数值安全取值：东财对缺失值返回 null/"-"，统一收敛为 undefined（仅接受有限数） */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** `"2025-12-31 00:00:00"` → `"2025-12-31"` */
function toDate(v: unknown): string {
  return str(v).slice(0, 10);
}

// ── 纯解析：每个端点一支，与网络层解耦，离线可测 ──────────────────────

interface SurveyResponse {
  jbzl?: Record<string, unknown>[] | null;
}

export function parseOverview(json: SurveyResponse): CompanyOverview | undefined {
  const r = json?.jbzl?.[0];
  if (!r) return undefined;
  return {
    fullName: str(r.ORG_NAME),
    industry: str(r.EM2016),
    listingBoard: str(r.SECURITY_TYPE),
    chairman: str(r.CHAIRMAN),
    employees: num(r.EMP_NUM),
    registeredCapital: num(r.REG_CAPITAL),
    province: str(r.PROVINCE),
    website: str(r.ORG_WEB),
    // 简介正文常带大量全角缩进空白，压平后再交给 UI
    profile: str(r.ORG_PROFILE).replace(/\s+/g, ' '),
    businessScope: '',
  };
}

interface BusinessResponse {
  zyfw?: Record<string, unknown>[] | null;
  zygcfx?: Record<string, unknown>[] | null;
}

/** 东财 MAINOP_TYPE → 本层维度名 */
const DIMENSIONS: Record<string, SegmentDimension> = {
  '1': 'industry',
  '2': 'product',
  '3': 'region',
};

/**
 * 主营构成：只取**最新报告期**。zygcfx 返回多期（实测茅台 200 条 ≈ 25 期），
 * 混在一起显示会把 2019 年的收入结构和今年的摆在同一张表里。
 */
export function parseSegments(json: BusinessResponse): {
  reportDate?: string;
  segments: BusinessSegment[];
} {
  const rows = json?.zygcfx;
  if (!Array.isArray(rows) || rows.length === 0) return { segments: [] };

  const latest = rows.reduce((max, r) => {
    const d = toDate(r.REPORT_DATE);
    return d > max ? d : max;
  }, '');
  if (!latest) return { segments: [] };

  const segments = rows
    .filter((r) => toDate(r.REPORT_DATE) === latest && DIMENSIONS[str(r.MAINOP_TYPE)])
    .map((r) => ({
      dimension: DIMENSIONS[str(r.MAINOP_TYPE)],
      name: str(r.ITEM_NAME),
      revenue: num(r.MAIN_BUSINESS_INCOME) ?? 0,
      revenueRatio: num(r.MBI_RATIO) ?? 0,
      grossMargin: num(r.GROSS_RPOFIT_RATIO),
    }));

  return { reportDate: latest, segments };
}

interface ShareholderResponse {
  gdrs?: Record<string, unknown>[] | null;
  sdltgd?: Record<string, unknown>[] | null;
}

/**
 * 股东结构：户数取最新一期，十大流通股东取最新截止日的那一批。
 *
 * sdltgd 也是多期堆在一个数组里（实测 10 条 = 1 期，但换股频繁的股票会更多），
 * 不按 END_DATE 过滤会把不同季度的股东混排。
 */
export function parseShareholding(json: ShareholderResponse): Shareholding | undefined {
  const counts = json?.gdrs;
  const holders = json?.sdltgd;
  const latestCount = Array.isArray(counts) ? counts[0] : undefined;

  let endDate = toDate(latestCount?.END_DATE);
  let topHolders: TopHolder[] = [];

  if (Array.isArray(holders) && holders.length > 0) {
    const holderDate = holders.reduce((max, r) => {
      const d = toDate(r.END_DATE);
      return d > max ? d : max;
    }, '');
    topHolders = holders
      .filter((r) => toDate(r.END_DATE) === holderDate)
      .map((r) => ({
        rank: num(r.HOLDER_RANK) ?? 0,
        name: str(r.HOLDER_NAME),
        shares: num(r.HOLD_NUM) ?? 0,
        ratio: num(r.FREE_HOLDNUM_RATIO) ?? 0,
        change: str(r.HOLD_NUM_CHANGE),
      }))
      .sort((a, b) => a.rank - b.rank);
    // 户数缺失时用股东名单的截止日兜底，两边都缺才算这块整体没有
    if (!endDate) endDate = holderDate;
  }

  if (!endDate && topHolders.length === 0) return undefined;

  return {
    endDate,
    holderCount: num(latestCount?.HOLDER_TOTAL_NUM),
    holderCountChange: num(latestCount?.TOTAL_NUM_RATIO),
    concentration: str(latestCount?.HOLD_FOCUS) || undefined,
    topHolders,
  };
}

interface ConceptResponse {
  ssbk?: Record<string, unknown>[] | null;
}

export function parseBoards(json: ConceptResponse): string[] {
  const rows = json?.ssbk;
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.map((r) => str(r.BOARD_NAME)).filter(Boolean))];
}

// ── 网络层 ────────────────────────────────────────────────────────

export interface CompanyF10Deps {
  fetchImpl?: typeof fetch;
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
}

async function getPage<T>(page: string, prefixedCode: string, deps: CompanyF10Deps): Promise<T> {
  const resp = await fetchWithPolicy(buildF10Url(page, prefixedCode), {
    headers: { Referer: 'https://emweb.securities.eastmoney.com/' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`东财 F10 ${page} HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

/** allSettled 的单块结果：失败只记日志、返回 undefined，不拖垮其余三块 */
function settled<T>(page: string, result: PromiseSettledResult<T>): T | undefined {
  if (result.status === 'fulfilled') return result.value;
  logger.warn(`F10 ${page} 拉取失败：${toErrorMessage(result.reason)}`);
  return undefined;
}

/**
 * 拉取一只 A 股的 F10 资料。
 *
 * `symbol` 必须是 A 股；调用方（handler）负责用 detectChinaStock 判定并给出前缀。
 * 四块全空时抛错——那说明不是「某块没披露」而是整条链路挂了或代码不存在。
 */
export async function fetchCompanyF10(
  symbol: string,
  prefixedCode: string,
  deps: CompanyF10Deps = {},
): Promise<CompanyF10> {
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;

  const key = cacheKey(['company-f10', prefixedCode]);
  const cached = _readCache<CompanyF10>(key, F10_CACHE_OPTS);
  if (cached) return cached;

  const [survey, business, shareholder, concept] = await Promise.allSettled([
    getPage<SurveyResponse>('CompanySurvey', prefixedCode, deps),
    getPage<BusinessResponse>('BusinessAnalysis', prefixedCode, deps),
    getPage<ShareholderResponse>('ShareholderResearch', prefixedCode, deps),
    getPage<ConceptResponse>('CoreConception', prefixedCode, deps),
  ]);

  const surveyJson = settled('CompanySurvey', survey) ?? {};
  const overview = parseOverview(surveyJson);
  const businessJson = settled('BusinessAnalysis', business) ?? {};
  const { reportDate, segments } = parseSegments(businessJson);
  // 经营范围与主营构成同属 BusinessAnalysis，但归到概况里显示更自然
  if (overview) overview.businessScope = str(businessJson.zyfw?.[0]?.BUSINESS_SCOPE);

  const result: CompanyF10 = {
    symbol,
    // 简称取自 F10 自身，不由调用方传入——handler 手上只有用户输入的代码
    name: str(surveyJson.jbzl?.[0]?.SECURITY_NAME_ABBR),
    overview,
    reportDate,
    segments,
    shareholding: parseShareholding(settled('ShareholderResearch', shareholder) ?? {}),
    boards: parseBoards(settled('CoreConception', concept) ?? {}),
    fetchedAt: Date.now(),
  };

  const empty =
    !result.overview && !result.shareholding && segments.length === 0 && result.boards.length === 0;
  if (empty) throw new Error(`未取到 ${symbol} 的 F10 资料（四块均为空）`);

  _writeCache(key, result, F10_CACHE_OPTS);
  return result;
}
