import type {
  ScreenField,
  ScreenQuery,
  ScreenMatch,
  MarketSnapshotEntry,
  QuantBundle,
} from './types';
export const COARSE_FIELD_SET = new Set<ScreenField>([
  'price',
  'changePercent',
  'pe',
  'pb',
  'marketCap',
  'turnoverRate',
]);
export const FINE_FIELD_SET = new Set<ScreenField>([
  'roe',
  'netMargin',
  'grossMargin',
  'debtToAsset',
  'currentRatio',
  'revenueGrowth',
  'netIncomeGrowth',
  'compositeScore',
]);
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

function isCoarseField(field: ScreenField) {
  return COARSE_FIELD_SET.has(field);
}
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

/** 分页结果使用同一字段口径全局排序，始终保留查询要求的前 N 项。 */
export function sortScreenMatches(matches: ScreenMatch[], query: ScreenQuery): ScreenMatch[] {
  const fine = query.conditions.some((c) => FINE_FIELD_SET.has(c.field));
  const sort = query.sortBy ?? { field: fine ? 'compositeScore' : 'marketCap', order: 'desc' };
  const dir = sort.order === 'asc' ? 1 : -1;
  return [...matches]
    .sort((a, b) => {
      const x = resolveFieldValue(sort.field as ScreenField, a.snapshot, a.quant),
        y = resolveFieldValue(sort.field as ScreenField, b.snapshot, b.quant);
      if (x === undefined && y === undefined) return 0;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (x - y) * dir;
    })
    .slice(0, query.limit);
}
