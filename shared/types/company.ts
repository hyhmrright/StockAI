/** 公司基本资料（俗称 F10）。仅 A 股——数据源是交易所 F10 披露，美股无对应形态。 */

/** 主营构成的切分维度（东财 MAINOP_TYPE：1 行业 / 2 产品 / 3 地区） */
export type SegmentDimension = 'industry' | 'product' | 'region';

/** 主营构成的一项 */
export interface BusinessSegment {
  dimension: SegmentDimension;
  name: string;
  revenue: number; // 营业收入(元)
  revenueRatio: number; // 占主营收入比，0..1
  grossMargin?: number; // 毛利率，0..1；缺失或不适用时不给
}

/** 十大流通股东的一位 */
export interface TopHolder {
  rank: number;
  name: string;
  shares: number; // 持股数(股)
  ratio: number; // 占流通股比(%)
  change: string; // 较上期变动，交易所口径原文（"不变" / "新进" / 数字）
}

/** 股东结构 */
export interface Shareholding {
  endDate: string; // 数据截止日 YYYY-MM-DD
  holderCount?: number; // 股东户数
  holderCountChange?: number; // 户数环比变动(%)
  concentration?: string; // 筹码集中度，交易所口径原文（"非常分散" 等）
  topHolders: TopHolder[];
}

/** 公司概况 */
export interface CompanyOverview {
  fullName: string;
  industry: string; // 东财行业分类，形如「食品饮料-饮料-白酒」
  listingBoard: string; // 上市板，形如「上交所主板A股」
  chairman: string;
  employees?: number;
  registeredCapital?: number; // 注册资本(万元)
  province: string;
  website: string;
  profile: string; // 公司简介全文
  businessScope: string; // 经营范围
}

/**
 * 一只 A 股的 F10 汇总。
 *
 * 四个板块各自独立成因，任一块缺失不影响其余——因此全部为可选，
 * 由 UI 按有无分别渲染，而不是缺一块就整体报错。
 */
export interface CompanyF10 {
  symbol: string;
  name: string;
  overview?: CompanyOverview;
  /** 主营构成的报告期 YYYY-MM-DD；segments 非空时必有 */
  reportDate?: string;
  segments: BusinessSegment[];
  shareholding?: Shareholding;
  boards: string[]; // 所属板块名（行业 + 概念）
  fetchedAt: number;
}
