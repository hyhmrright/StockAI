import { tmpdir } from 'os';
import * as path from 'path';
import type { SectorBoards, SectorRank } from '../../shared/types';
import { type CacheOptions, cacheKey, readCache, writeCache } from '../cache';
import { fetchWithPolicy } from '../http';
import { toErrorMessage } from '../utils';
import { logger } from '../log';
import { extractSinaJson } from '../parsers/sina-envelope';

/**
 * 板块涨幅榜（东财 push2 clist，与 market-snapshot 同一端点、不同 fs 过滤）。
 *
 * 板块类型实测：`m:90 t:1` 地域(31 个)、`m:90 t:2` 行业(496 个)、`m:90 t:3` 概念(504 个)。
 * 只取行业与概念——地域板块对选股几乎没有信息量。
 *
 * **`np=1` 不能省**：不带它时 `data.diff` 返回的是 `{"0":{...},"1":{...}}` 对象而非数组，
 * 解析会静默得到空表（实测踩过）。这也是 market-snapshot 用同一组参数的原因。
 */

// f12=板块代码 f14=板块名 f3=涨跌幅 f62=主力净流入 f104=上涨家数 f105=下跌家数
// f128=领涨股名 f140=领涨股代码 f136=领涨股涨幅
const FIELDS = 'f12,f14,f3,f62,f104,f105,f128,f136,f140';

/** 一次取多少个板块。榜单看的是头部，全量 500 个既无用又浪费带宽。 */
export const SECTOR_TOP_N = 10;

const BOARD_FS = {
  industry: 'm:90+t:2',
  concept: 'm:90+t:3',
} as const;

export type SectorBoardKind = keyof typeof BOARD_FS;

/**
 * 实测两张榜合计约 1.8s，而面板按页签条件挂载（`useAsyncOnce` 挂载即取）——
 * 关掉市场概览再打开、在两个页签间来回切，每次都重走全程。
 *
 * TTL 只给 60 秒，远短于邻居们的 24h：这是**盘中实时变动**的涨幅榜，
 * 不是 F10 那种按季更新的档案。60 秒足够吃掉「来回切页签」这个真正的重复来源，
 * 又不至于让用户盯着一个明显停住的榜单——它本来也不轮询（见 MarketOverviewModal）。
 */
const SECTOR_CACHE_OPTS: CacheOptions = {
  // 独立目录不是可有可无的：maxEntries 修剪的是「目录里的文件数」，与邻居共用根目录时
  // 配额最小的那个说了算——本模块只要 4 条，共用就会把深度分析的结果一并删光。
  // 同 f10 / 财报历史 / 全市场快照的做法。
  dir: path.join(tmpdir(), 'stockai-sector-cache'),
  ttlMs: 60_000,
  maxEntries: 4, // 无参数、只有一个 key，保守即可
};

interface SectorRow {
  f12?: string;
  f14?: string;
  f3?: number | string;
  f62?: number | string;
  f104?: number | string;
  f105?: number | string;
  f128?: string;
  f136?: number | string;
  f140?: string;
}

interface SectorResponse {
  data?: { diff?: SectorRow[] } | null;
}

/** 东财对缺失值返回 "-"/null，统一收敛为 0（板块榜的家数与净流入缺失即视为 0） */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 构造板块榜 URL。fid=f3 + po=1 = 按涨跌幅降序，即涨幅榜。 */
export function buildSectorUrl(kind: SectorBoardKind, top = SECTOR_TOP_N): string {
  return (
    'https://push2.eastmoney.com/api/qt/clist/get' +
    `?pn=1&pz=${top}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${BOARD_FS[kind]}&fields=${FIELDS}`
  );
}

/** 纯解析：一页板块响应 → SectorRank[]（跳过无代码的脏行） */
export function parseSectorPage(json: SectorResponse): SectorRank[] {
  const rows = json?.data?.diff;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => !!r?.f12)
    .map((r) => ({
      code: r.f12 as string,
      name: r.f14 ?? '',
      changePercent: num(r.f3),
      mainNetInflow: num(r.f62),
      advancers: num(r.f104),
      decliners: num(r.f105),
      // 领涨股三个字段缺任一就整体不给，半截的领涨股信息没法显示
      leader:
        r.f128 && r.f140 ? { name: r.f128, symbol: r.f140, changePercent: num(r.f136) } : undefined,
    }));
}

export interface SectorDeps {
  fetchImpl?: typeof fetch;
  readCacheImpl?: typeof readCache;
  writeCacheImpl?: typeof writeCache;
}

async function fetchBoard(kind: SectorBoardKind, deps: SectorDeps): Promise<SectorRank[]> {
  const resp = await fetchWithPolicy(buildSectorUrl(kind), {
    headers: { Referer: 'https://quote.eastmoney.com' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`东财板块榜 HTTP ${resp.status}`);
  return parseSectorPage(await resp.json());
}

// ─────────────────── 新浪备源 ───────────────────

/**
 * 东财 push2 整机故障时的备源（2026-08-09 实测 502，板块榜整块打不开）。
 *
 * 覆盖度不如东财：**没有主力净流入，也没有涨跌家数**——那三个字段留空，
 * 由 UI 显示「—」。填 0 会被读成"没有资金进出"，是一句我们并不知道的断言。
 */
const SINA_BOARD_URL: Record<SectorBoardKind, string> = {
  industry: 'https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php',
  concept: 'https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class',
};

/**
 * 新浪板块响应：`var X = {"代码":"逗号分隔的一行", ...};`（GBK）。
 * 行内字段（0-based）：0=代码 1=名称 2=公司家数 3=平均价 4=涨跌额 5=涨跌幅%
 *                     6=总成交量 7=总成交额 8=领涨股代码 9=领涨股涨跌幅
 *                     10=领涨股现价 11=领涨股涨跌额 12=领涨股名称
 */
export function parseSinaSectorPage(text: string, top = SECTOR_TOP_N): SectorRank[] {
  const table = extractSinaJson<Record<string, string>>(text, '{');
  if (!table) throw new Error('新浪板块榜响应不含对象体');

  return (
    Object.values(table)
      .map((line) => String(line).split(','))
      .filter((f) => f.length >= 13 && f[0] && Number.isFinite(Number(f[5])))
      .map((f) => ({
        code: f[0],
        name: f[1],
        changePercent: Number(Number(f[5]).toFixed(2)),
        // mainNetInflow / advancers / decliners 本源没有，刻意不填
        leader:
          f[8] && f[12]
            ? // 不能复用上面的 num()：它只认 number 类型，而新浪整行都是字符串，会恒得 0
              { name: f[12], symbol: f[8], changePercent: Number(Number(f[9]).toFixed(2)) || 0 }
            : undefined,
      }))
      // 新浪返回全量且不排序，涨幅榜要自己排
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, top)
  );
}

async function fetchSinaBoard(kind: SectorBoardKind, deps: SectorDeps): Promise<SectorRank[]> {
  const resp = await fetchWithPolicy(SINA_BOARD_URL[kind], {
    headers: { Referer: 'https://finance.sina.com.cn' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`新浪板块榜 HTTP ${resp.status}`);
  // 板块名是中文，GBK 直接 text() 会拿到乱码
  const rows = parseSinaSectorPage(new TextDecoder('gbk').decode(await resp.arrayBuffer()));
  // 新浪的板块恒有几百个，解析出 0 行只可能是格式变了或被挡了。
  // 这里必须抛：备源静静返回空表，会把东财的故障伪装成"今天没有板块在动"的空面板。
  if (rows.length === 0) throw new Error('新浪板块榜解析为空');
  return rows;
}

/**
 * 两张榜并发拉；**一张失败即整体失败**——半截的市场概览比没有更容易误导，
 * 用户会以为"今天只有行业板块在动"。
 *
 * 回退是**整组**回退而非逐张：两张榜混用不同源会让两边的字段覆盖度不一致
 * （东财那张有资金流、新浪那张没有），并排看更像 bug。
 */
async function fetchBothBoards(deps: SectorDeps): Promise<[SectorRank[], SectorRank[]]> {
  try {
    return await fetchEastmoneyBoards(deps);
  } catch (err) {
    logger.warn(`东财板块榜失败，回退新浪：${toErrorMessage(err)}`);
    return await fetchSinaBoards(deps);
  }
}

/**
 * 两个源各自导出，供集成测试**逐源直连**——走 fetchSectorBoards 的话，
 * 新浪的成功会掩盖东财的失效，那正是每日冒烟要暴露的东西。
 */
export function fetchEastmoneyBoards(deps: SectorDeps = {}): Promise<[SectorRank[], SectorRank[]]> {
  return Promise.all([fetchBoard('industry', deps), fetchBoard('concept', deps)]);
}

export function fetchSinaBoards(deps: SectorDeps = {}): Promise<[SectorRank[], SectorRank[]]> {
  return Promise.all([fetchSinaBoard('industry', deps), fetchSinaBoard('concept', deps)]);
}

/**
 * 抓取行业 + 概念两张涨幅榜。
 */
export async function fetchSectorBoards(deps: SectorDeps = {}): Promise<SectorBoards> {
  const _readCache = deps.readCacheImpl ?? readCache;
  const _writeCache = deps.writeCacheImpl ?? writeCache;

  const key = cacheKey(['sector-boards', 'v1']);
  const cached = _readCache<SectorBoards>(key, SECTOR_CACHE_OPTS);
  if (cached) return cached;

  const [industry, concept] = await fetchBothBoards(deps);
  const result: SectorBoards = { industry, concept, fetchedAt: Date.now() };

  // 空表不写缓存：漏 np=1 时解析会静默得到空表（本模块开头那个坑），
  // 缓存下来就把一次解析失败固化成一分钟的空榜。
  if (industry.length > 0 && concept.length > 0) _writeCache(key, result, SECTOR_CACHE_OPTS);
  return result;
}
