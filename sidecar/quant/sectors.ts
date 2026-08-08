import type { SectorBoards, SectorRank } from '../../shared/types';
import { fetchWithPolicy } from '../http';

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
}

async function fetchBoard(kind: SectorBoardKind, deps: SectorDeps): Promise<SectorRank[]> {
  const resp = await fetchWithPolicy(buildSectorUrl(kind), {
    headers: { Referer: 'https://quote.eastmoney.com' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`东财板块榜 HTTP ${resp.status}`);
  return parseSectorPage(await resp.json());
}

/**
 * 抓取行业 + 概念两张涨幅榜。
 *
 * 两张榜并发拉；**一张失败即整体失败**——半截的市场概览比没有更容易误导，
 * 用户会以为"今天只有行业板块在动"。
 */
export async function fetchSectorBoards(deps: SectorDeps = {}): Promise<SectorBoards> {
  const [industry, concept] = await Promise.all([
    fetchBoard('industry', deps),
    fetchBoard('concept', deps),
  ]);
  return { industry, concept, fetchedAt: Date.now() };
}
