import type {
  Position,
  PositionValuation,
  PortfolioSummary,
  PortfolioOverview,
  RealtimeQuote,
} from '../../shared/types';

/**
 * 持仓估值的纯函数层——不碰网络、不碰数据库，全部可离线测试。
 *
 * 两条硬规矩，都是「宁可少算也不能算错」：
 *
 * 1. **跨币种绝不相加**。A 股按人民币、美股按美元，本项目没有汇率数据源，
 *    把两者加起来只是在编一个没有意义的数字。故汇总按币种分组产出。
 *
 * 2. **取不到价的持仓完全不进汇总**。若把它的成本计入总成本、市值却记 0，
 *    组合会凭空显示一笔巨亏；反过来把市值按成本填也是在编造"不赚不赔"。
 *    正确做法是排除，并把这些标的显式列出来让用户知道少算了什么。
 */

/** 加仓后的加权平均成本。两笔都为 0 股时退化为 0，避免除零产出 NaN。 */
export function mergeCost(
  existing: { shares: number; costPrice: number },
  added: { shares: number; costPrice: number },
): { shares: number; costPrice: number } {
  const shares = existing.shares + added.shares;
  if (shares === 0) return { shares: 0, costPrice: 0 };
  const costPrice =
    (existing.shares * existing.costPrice + added.shares * added.costPrice) / shares;
  return { shares, costPrice };
}

/** 单笔估值。没有报价时只填 cost，其余留空。 */
function valuate(position: Position, quote?: RealtimeQuote): PositionValuation {
  const cost = position.shares * position.costPrice;
  if (!quote) return { position, cost };

  const marketValue = position.shares * quote.price;
  const pnl = marketValue - cost;
  return {
    position,
    cost,
    quote,
    marketValue,
    pnl,
    // 成本为 0（白得的股票 / 填了 0 成本）时收益率无意义，留空而不是报 Infinity
    pnlPercent: cost === 0 ? undefined : (pnl / cost) * 100,
    dayPnl: (quote.price - quote.prevClose) * position.shares,
  };
}

/** 汇总一个币种下的全部已定价持仓 */
function summarize(
  currency: RealtimeQuote['currency'],
  priced: PositionValuation[],
): PortfolioSummary {
  const totalCost = priced.reduce((s, v) => s + v.cost, 0);
  const totalValue = priced.reduce((s, v) => s + (v.marketValue ?? 0), 0);
  const totalPnl = totalValue - totalCost;
  return {
    currency,
    totalCost,
    totalValue,
    totalPnl,
    totalPnlPercent: totalCost === 0 ? 0 : (totalPnl / totalCost) * 100,
    dayPnl: priced.reduce((s, v) => s + (v.dayPnl ?? 0), 0),
    positionCount: priced.length,
  };
}

/**
 * 组合全貌。valuations 保持传入顺序，便于 UI 稳定渲染；
 * weight 按**同币种**市值占比计算——跨币种的占比同样是无意义的数字。
 */
export function buildOverview(
  positions: Position[],
  quotes: Record<string, RealtimeQuote>,
): PortfolioOverview {
  const valuations = positions.map((p) => valuate(p, quotes[p.symbol]));

  const byCurrency = new Map<RealtimeQuote['currency'], PositionValuation[]>();
  for (const v of valuations) {
    if (!v.quote) continue;
    const bucket = byCurrency.get(v.quote.currency);
    if (bucket) bucket.push(v);
    else byCurrency.set(v.quote.currency, [v]);
  }

  for (const [, priced] of byCurrency) {
    const total = priced.reduce((s, v) => s + (v.marketValue ?? 0), 0);
    if (total === 0) continue;
    for (const v of priced) v.weight = ((v.marketValue ?? 0) / total) * 100;
  }

  return {
    summaries: [...byCurrency].map(([currency, priced]) => summarize(currency, priced)),
    valuations,
    unpriced: valuations.filter((v) => !v.quote).map((v) => v.position.symbol),
  };
}
