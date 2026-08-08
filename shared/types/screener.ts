// 选股：自选股批量量化扫描（ScreenerResult）+ #14 全市场自然语言筛选（Screen*）
import type { QuantBundle, MarketSnapshotEntry } from './quant';

/** 筛选器单项结果（watchlist 自选股批量量化扫描） */
export interface ScreenerResult {
  symbol: string;
  name: string;
  quant: QuantBundle;
}

// ─── #14 自然语言选股（NL Screener）─────────────────────────────────────────
// 注意：与上方 `ScreenerResult`（watchlist 自选股批量量化扫描）**语义不同**。
// 本组类型服务「全市场自然语言筛选」：LLM 把自然语言解析成结构化 ScreenQuery，
// sidecar 两阶段（粗筛快照 + 候选精拉）执行后返回 ScreenResponse。前后端 re-export，勿各层重复定义。

/** #14 NL 选股：比较符 */
export type ScreenComparator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

/**
 * 可筛选字段。coarse=MarketSnapshotEntry 直接有（粗筛，无需精拉）；
 * fine=需对候选逐只 --quant 精拉后才有（见蓝图 §4 映射表）。
 */
export type ScreenField =
  // coarse（快照字段）
  | 'price'
  | 'changePercent'
  | 'pe'
  | 'pb'
  | 'marketCap'
  | 'turnoverRate'
  // fine（QuantBundle 派生）
  | 'roe'
  | 'netMargin'
  | 'grossMargin'
  | 'debtToAsset'
  | 'currentRatio'
  | 'revenueGrowth'
  | 'netIncomeGrowth'
  | 'compositeScore';

/** 单条数值筛选条件（v1 仅数值比较；「看涨」类语义由 LLM 映射为 compositeScore 阈值） */
export interface ScreenCondition {
  field: ScreenField;
  op: ScreenComparator;
  value: number;
}

/** 板块过滤（按 symbol 前缀分类；缺省 all） */
export type ScreenBoard = 'main' | 'star' | 'chinext' | 'bj' | 'all';

/** LLM 把自然语言解析成的结构化查询（sidecar 校验后执行；回显给前端核对） */
export interface ScreenQuery {
  conditions: ScreenCondition[];
  board: ScreenBoard; // 默认 'all'
  limit: number; // 结果条数上限，默认 30，clamp 1..100
  sortBy?: { field: ScreenField; order: 'asc' | 'desc' };
}

/** 单只命中股票。snapshot 恒有；quant 仅当查询含 fine 条件、该股被精拉时才有 */
export interface ScreenMatch {
  symbol: string;
  name: string;
  snapshot: MarketSnapshotEntry;
  quant?: QuantBundle;
}

/** --screen 完整响应（query 回显供「AI 理解为…」透明展示） */
export interface ScreenResponse {
  query: ScreenQuery;
  matches: ScreenMatch[];
  scannedCoarse: number; // 粗筛通过的候选数
  refinedCount: number; // 实际精拉的股票数（0=纯粗筛）
  fetchedAt: number; // Unix 毫秒
}
