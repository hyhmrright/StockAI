import type { RealtimeQuote } from './stock';

/**
 * 一笔持仓（用户真实持有，非虚拟大师组合）。
 * shares / costPrice 是加权平均后的结果，不记逐笔流水，详见 migration 004。
 */
export interface Position {
  id: number;
  symbol: string;
  /** 显示名。建仓时若还没有报价可能为空，之后由报价补上 */
  name?: string;
  shares: number;
  /** 加权平均成本价 */
  costPrice: number;
  /** 首次建仓时间（Unix 毫秒） */
  openedAt: number;
  note?: string;
}

/** 新建/更新持仓的入参（id 由数据库分配） */
export type PositionInput = Omit<Position, 'id'>;

/**
 * 单笔持仓的估值。price 缺失时（取价失败）后续字段全为 undefined——
 * 用 0 代替会让"这只没数据"和"这只不赚不赔"变成同一个显示。
 */
export interface PositionValuation {
  position: Position;
  /** 成本额 = shares × costPrice，与是否取到价无关，永远有值 */
  cost: number;
  quote?: RealtimeQuote;
  /** 市值 = shares × 现价 */
  marketValue?: number;
  /** 浮动盈亏 = 市值 − 成本额 */
  pnl?: number;
  /** 浮动盈亏比例（%） */
  pnlPercent?: number;
  /** 当日盈亏 = (现价 − 昨收) × 份额 */
  dayPnl?: number;
  /** 占同币种组合市值的比重（%） */
  weight?: number;
}

/** 一个币种下的组合汇总。跨币种不合并——没有汇率源，加总等于编数字。 */
export interface PortfolioSummary {
  currency: RealtimeQuote['currency'];
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayPnl: number;
  /** 计入本汇总的持仓数 */
  positionCount: number;
}

/** 组合全貌：按币种分组的汇总 + 逐笔估值 + 未取到价的标的 */
export interface PortfolioOverview {
  summaries: PortfolioSummary[];
  valuations: PositionValuation[];
  /** 取不到价、因而未计入任何汇总的标的 */
  unpriced: string[];
}
