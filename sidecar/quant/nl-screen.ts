import type {
  Language,
  MarketSnapshot,
  MarketSnapshotEntry,
  QuantBundle,
  ScreenBoard,
  ScreenComparator,
  ScreenCondition,
  ScreenField,
  ScreenMatch,
  ScreenQuery,
  ScreenResponse,
} from '../../shared/types';
import type { ChatProvider } from '../agents/types';
import { buildScreenPrompt } from '../prompts';
import { parseJsonFromAi, toErrorMessage, withTimeout } from '../utils';
import { logger } from '../log';
import { fetchQuantBundle } from './index';
import { fetchMarketSnapshot } from './market-snapshot';

/**
 * #14 自然语言选股（NL Screener）核心：LLM 解析 → 快照粗筛 → 候选精拉 → 精筛。
 * 全流程在 sidecar 内完成（见蓝图 §5）；纯函数独立导出供离线单测，网络依赖走 DI。
 */

// ── 常量（附 rationale）────────────────────────────────────────────────────
/** 用户未指定条数时的默认返回上限 */
export const DEFAULT_LIMIT = 30;
/** fine 精拉前的候选硬上限：防止对数千只逐只 --quant 拖垮性能 + 触发反爬 */
export const CANDIDATE_CAP = 30;
/** 精拉并发上限（对齐既有 useScreener 的 3~4 + 快照抖动风控） */
export const SCREEN_CONCURRENCY = 4;
/** 单只精拉超时，慢股不拖垮整体（fetchQuantBundle 内部已 allSettled，再包一层超时） */
export const QUANT_TIMEOUT_MS = 20_000;

// ── 错误类型（供 handleScreen 映射错误码）────────────────────────────────────
/** LLM 返回非 JSON / schema 完全不合法 → ERR_SCREEN_PARSE */
export class ScreenParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenParseError';
  }
}

/** 解析成功但零可用条件（含全部被丢弃）→ ERR_SCREEN_NO_CONDITIONS */
export class ScreenNoConditionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenNoConditionsError';
  }
}

// ── 字段分层 & 枚举集合 ───────────────────────────────────────────────────
const COARSE_FIELD_SET = new Set<ScreenField>([
  'price',
  'changePercent',
  'pe',
  'pb',
  'marketCap',
  'turnoverRate',
]);
const FINE_FIELD_SET = new Set<ScreenField>([
  'roe',
  'netMargin',
  'grossMargin',
  'debtToAsset',
  'currentRatio',
  'revenueGrowth',
  'netIncomeGrowth',
  'compositeScore',
]);
const ALL_FIELD_SET = new Set<string>([...COARSE_FIELD_SET, ...FINE_FIELD_SET]);
const COMPARATOR_SET = new Set<string>(['gt', 'gte', 'lt', 'lte', 'eq']);
const BOARD_SET = new Set<string>(['main', 'star', 'chinext', 'bj', 'all']);

/** fine 字段 → QuantBundle.fundamental.checks 的 key（映射表单一真源，见蓝图 §4） */
const FINE_CHECK_KEY: Partial<Record<ScreenField, string>> = {
  roe: 'roe',
  netMargin: 'net_margin',
  grossMargin: 'gross_margin',
  debtToAsset: 'debt_to_asset',
  currentRatio: 'current_ratio',
  revenueGrowth: 'revenue_growth',
  netIncomeGrowth: 'net_income_growth',
};

/** 默认排序：无 fine 条件时按市值降序（精拉前唯一稳定可得的规模键） */
const DEFAULT_COARSE_SORT: NonNullable<ScreenQuery['sortBy']> = {
  field: 'marketCap',
  order: 'desc',
};
/** 默认排序：有 fine 条件时按综合分降序 */
const DEFAULT_FINE_SORT: NonNullable<ScreenQuery['sortBy']> = {
  field: 'compositeScore',
  order: 'desc',
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function isCoarseField(field: ScreenField): boolean {
  return COARSE_FIELD_SET.has(field);
}

export function isFineField(field: ScreenField): boolean {
  return FINE_FIELD_SET.has(field);
}

// ── 板块分类器（前缀规则，见蓝图 §4）────────────────────────────────────────
/** 按代码前缀归板块；容忍带交易所前缀（先剥非数字取纯 6 位代码） */
export function boardOf(symbol: string): ScreenBoard {
  const code = symbol.replace(/\D/g, '');
  if (code.startsWith('688')) return 'star'; // 科创板
  if (code.startsWith('300') || code.startsWith('301')) return 'chinext'; // 创业板
  // 北交所：83/87/88（8 开头）、43、920（92 开头）
  if (code.startsWith('8') || code.startsWith('43') || code.startsWith('92')) return 'bj';
  // 沪市主板 60x + 深市主板 000/001/002/003（含原中小板）
  if (
    code.startsWith('60') ||
    code.startsWith('000') ||
    code.startsWith('001') ||
    code.startsWith('002') ||
    code.startsWith('003')
  ) {
    return 'main';
  }
  return 'main'; // 兜底归主板
}

// ── 字段取值（resolveFieldValue 的单一真源）─────────────────────────────────
/** coarse 字段从快照直接读（显式 switch，避免 keyof 索引越界） */
function coarseValue(field: ScreenField, entry: MarketSnapshotEntry): number | undefined {
  switch (field) {
    case 'price':
      return entry.price;
    case 'changePercent':
      return entry.changePercent;
    case 'pe':
      return entry.pe;
    case 'pb':
      return entry.pb;
    case 'marketCap':
      return entry.marketCap;
    case 'turnoverRate':
      return entry.turnoverRate;
    default:
      return undefined;
  }
}

/**
 * 解析某字段的数值：coarse 从 snapshot，fine 从 quant（缺 quant/缺值一律 undefined）。
 * 缺值返回 undefined，交由 cmp 判「不通过」（保守：数据缺失不纳入命中）。
 */
export function resolveFieldValue(
  field: ScreenField,
  entry: MarketSnapshotEntry,
  quant?: QuantBundle,
): number | undefined {
  if (isCoarseField(field)) return coarseValue(field, entry);
  if (!quant) return undefined;
  if (field === 'compositeScore') {
    const score = quant.composite?.score;
    return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
  }
  const key = FINE_CHECK_KEY[field];
  if (!key) return undefined;
  const actual = quant.fundamental?.checks?.find((c) => c.key === key)?.actual;
  return typeof actual === 'number' && Number.isFinite(actual) ? actual : undefined;
}

/** 数值比较；actual 缺失（undefined）一律判不通过 */
export function cmp(actual: number | undefined, op: ScreenComparator, value: number): boolean {
  if (actual === undefined) return false;
  switch (op) {
    case 'gt':
      return actual > value;
    case 'gte':
      return actual >= value;
    case 'lt':
      return actual < value;
    case 'lte':
      return actual <= value;
    case 'eq':
      return actual === value;
    default:
      return false;
  }
}

/** 粗筛：板块匹配（all 不过滤）+ 全部 coarse 条件通过 */
export function matchesCoarse(
  entry: MarketSnapshotEntry,
  coarseConds: ScreenCondition[],
  board: ScreenBoard,
): boolean {
  if (board !== 'all' && boardOf(entry.symbol) !== board) return false;
  return coarseConds.every((c) => cmp(resolveFieldValue(c.field, entry), c.op, c.value));
}

// ── 校验 ────────────────────────────────────────────────────────────────
/** 单条件校验：field/op 合法 + value 为有限数，否则返回 null（best-effort 丢弃） */
function toCondition(item: unknown): ScreenCondition | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  if (typeof o.field !== 'string' || !ALL_FIELD_SET.has(o.field)) return null;
  if (typeof o.op !== 'string' || !COMPARATOR_SET.has(o.op)) return null;
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return null;
  return { field: o.field as ScreenField, op: o.op as ScreenComparator, value: o.value };
}

/** limit clamp 到 1..100；缺省/非法 → DEFAULT_LIMIT */
function clampLimit(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_LIMIT;
  return Math.min(100, Math.max(1, Math.round(v)));
}

/** sortBy 校验：field 非法整体丢弃；order 非 'asc' 一律归 'desc' */
function toSortBy(v: unknown): ScreenQuery['sortBy'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.field !== 'string' || !ALL_FIELD_SET.has(o.field)) return undefined;
  return { field: o.field as ScreenField, order: o.order === 'asc' ? 'asc' : 'desc' };
}

/**
 * 把 LLM 原始解析对象校验为 ScreenQuery。
 * - 非对象 / conditions 非数组 → ScreenParseError（schema 完全不合法）
 * - conditions 全部被丢弃（含 LLM 返回 []）→ ScreenNoConditionsError
 * - board 非法 → 'all'；limit clamp；sortBy.field 非法 → 丢弃 sortBy
 */
export function validateScreenQuery(raw: unknown): ScreenQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScreenParseError('解析结果不是对象');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.conditions)) {
    throw new ScreenParseError('conditions 字段缺失或非数组');
  }
  const conditions: ScreenCondition[] = [];
  for (const item of obj.conditions) {
    const c = toCondition(item);
    if (c) conditions.push(c);
  }
  if (conditions.length === 0) {
    throw new ScreenNoConditionsError('未能识别出可用的筛选条件');
  }
  const board = (
    typeof obj.board === 'string' && BOARD_SET.has(obj.board) ? obj.board : 'all'
  ) as ScreenBoard;
  const sortBy = toSortBy(obj.sortBy);
  return { conditions, board, limit: clampLimit(obj.limit), ...(sortBy ? { sortBy } : {}) };
}

// ── LLM 解析 ──────────────────────────────────────────────────────────────
/**
 * 用 LLM 把自然语言选股需求解析为结构化 ScreenQuery。
 * LLM 原文只走 stderr（截断），绝不进 stdout；apiKey 绝不进任何日志。
 */
export async function parseScreenQuery(
  nlQuery: string,
  chat: ChatProvider,
  language: Language = 'zh',
): Promise<ScreenQuery> {
  const system = buildScreenPrompt(language);
  const raw = await chat.chat(system, nlQuery);
  // 截断打印 LLM 原文（仅 stderr，便于调试解析问题）
  logger.debug(`选股 LLM 原文(截断): ${raw.slice(0, 500)}`);
  let parsed: unknown;
  try {
    parsed = parseJsonFromAi(raw);
  } catch {
    // 不回传 LLM 原文，避免污染 stdout / 泄漏无关内容
    throw new ScreenParseError('模型未返回合法 JSON');
  }
  const query = validateScreenQuery(parsed);
  logger.debug(`选股解析结果: ${JSON.stringify(query)}`);
  return query;
}

// ── 排序 ────────────────────────────────────────────────────────────────
/** 按取值升/降序；缺值（undefined）一律沉底，避免缺值挤占头部 */
function sortByValue<T>(
  items: T[],
  getVal: (t: T) => number | undefined,
  order: 'asc' | 'desc',
): T[] {
  const dir = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    return (va - vb) * dir;
  });
}

// ── 两阶段筛选主流程 ─────────────────────────────────────────────────────
export interface RunScreenParams {
  nlQuery: string;
  chat: ChatProvider;
  language?: Language;
  /** 测试注入：替换真实快照/精拉/抖动，避开网络 */
  _fetchSnapshot?: () => Promise<MarketSnapshot>;
  _fetchQuant?: (symbol: string) => Promise<QuantBundle>;
  _sleep?: (ms: number) => Promise<void>;
}

export async function runScreen(params: RunScreenParams): Promise<ScreenResponse> {
  const { nlQuery, chat, language = 'zh' } = params;
  const _fetchSnapshot = params._fetchSnapshot ?? (() => fetchMarketSnapshot());
  const _fetchQuant = params._fetchQuant ?? ((symbol: string) => fetchQuantBundle(symbol));
  const _sleep = params._sleep ?? sleep;

  // ① 解析（失败向上抛 ScreenParseError / ScreenNoConditionsError）
  const query = await parseScreenQuery(nlQuery, chat, language);

  // ② 快照
  const snapshot = await _fetchSnapshot();
  const entries = snapshot.entries;
  if (!entries || entries.length === 0) {
    throw new Error('全市场快照为空，筛选服务暂不可用');
  }

  // 拆分 coarse / fine 条件
  const coarseConds = query.conditions.filter((c) => isCoarseField(c.field));
  const fineConds = query.conditions.filter((c) => isFineField(c.field));

  // ⑤ 粗筛（纯内存过滤，几千行无压力）
  const candidates = entries.filter((e) => matchesCoarse(e, coarseConds, query.board));
  const scannedCoarse = candidates.length;

  // ⑥ 无 fine 条件：纯粗筛快路径
  if (fineConds.length === 0) {
    // sortBy 若指向 fine 字段（此时无法精拉）则退回市值降序
    const sort =
      query.sortBy && isCoarseField(query.sortBy.field) ? query.sortBy : DEFAULT_COARSE_SORT;
    const sorted = sortByValue(candidates, (e) => resolveFieldValue(sort.field, e), sort.order);
    const matches: ScreenMatch[] = sorted
      .slice(0, query.limit)
      .map((e) => ({ symbol: e.symbol, name: e.name, snapshot: e }));
    return { query, matches, scannedCoarse, refinedCount: 0, fetchedAt: Date.now() };
  }

  // ⑦ 有 fine 条件：候选按精拉前可得的排序键取前 CANDIDATE_CAP 只
  const preSort =
    query.sortBy && isCoarseField(query.sortBy.field) ? query.sortBy : DEFAULT_COARSE_SORT;
  const pool = sortByValue(
    candidates,
    (e) => resolveFieldValue(preSort.field, e),
    preSort.order,
  ).slice(0, CANDIDATE_CAP);

  // 并发精拉（SCREEN_CONCURRENCY 一批）+ 抖动；单只失败/超时 → skip（不中断整体）
  const refined: ScreenMatch[] = [];
  let refinedCount = 0;
  for (let i = 0; i < pool.length; i += SCREEN_CONCURRENCY) {
    const batch = pool.slice(i, i + SCREEN_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (entry) => {
        await _sleep(120 + Math.floor(Math.random() * 180)); // 120–300ms 抖动
        try {
          const quant = await withTimeout(
            _fetchQuant(entry.symbol),
            QUANT_TIMEOUT_MS,
            `精拉 ${entry.symbol} 超时`,
          );
          return { entry, quant };
        } catch (err) {
          logger.warn(`候选精拉失败/超时，跳过 ${entry.symbol}: ${toErrorMessage(err)}`);
          return null;
        }
      }),
    );
    for (const r of results) {
      if (!r) continue;
      refinedCount++;
      const passed = fineConds.every((c) =>
        cmp(resolveFieldValue(c.field, r.entry, r.quant), c.op, c.value),
      );
      if (passed) {
        refined.push({
          symbol: r.entry.symbol,
          name: r.entry.name,
          snapshot: r.entry,
          quant: r.quant,
        });
      }
    }
  }

  // 结果排序：sortBy（现可用 fine 字段）或默认综合分降序 → 取 limit
  const finalSort = query.sortBy ?? DEFAULT_FINE_SORT;
  const sorted = sortByValue(
    refined,
    (m) => resolveFieldValue(finalSort.field, m.snapshot, m.quant),
    finalSort.order,
  );
  return {
    query,
    matches: sorted.slice(0, query.limit),
    scannedCoarse,
    refinedCount,
    fetchedAt: Date.now(),
  };
}
