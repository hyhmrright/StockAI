// 量化评分四维（技术/基本面/估值/波动）、资金流、关键价位与全市场横截面
import type { Market } from './stock';

/** 可下钻的单项检查：让评分从黑箱变成「凭哪几条判 bullish」 */
export interface CheckItem {
  /** 指标 key，前端据此映射 i18n 标签（如 roe / net_margin / pe） */
  key: string;
  /** 实际值 */
  actual: number;
  /** 通过阈值 */
  threshold: number;
  /** actual 与 threshold 的比较方向：gte=越高越好，lte=越低越好 */
  comparator: 'gte' | 'lte';
  /** true=通过 / false=未通过 / null=中性（介于优劣阈值之间） */
  passed: boolean | null;
}

/** 单维度分析信号 */
export interface AnalystSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  details: Record<string, number | string>;
  /** 可下钻的逐项检查（目前基本面四维提供；技术面为空） */
  checks?: CheckItem[];
}

/** 估值快照 */
export interface ValuationSnapshot {
  intrinsicValue: number | null;
  marketCap: number | null;
  marginOfSafety: number | null;
  signal: 'undervalued' | 'overvalued' | 'fair';
  confidence: number;
  models: {
    ownerEarnings?: { value: number; details: string };
    dcf?: { base: number; bear: number; bull: number; wacc: number };
    relative?: { signal: string; details: string };
  };
}

/** 风险快照 */
export interface RiskSnapshot {
  annualizedVolatility: number;
  volatilityPercentile: number;
  maxDrawdown: number;
  sharpeProxy: number;
  riskLevel: 'low' | 'medium' | 'high';
}

/** 仓位建议（由风险快照按波动率目标法派生，仅风险参考，非投资建议） */
export interface PositionGuidance {
  /** 建议单股仓位上限，整数百分比 0-100 */
  maxPositionPct: number;
  /** 风险档位，复用 RiskSnapshot.riskLevel 口径 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 年化波动率（复用自 RiskSnapshot，便于前端展示口径一致） */
  annualizedVolatility: number;
}

/** 波动率区间：把年化 σ 翻译成「未来一段时间约 95% 概率落在 -X%~+Y%」（统计估算，非保证） */
export interface VolatilityRange {
  /** 下行幅度（百分比，负数，已按最大亏损 -100% 夹紧） */
  downside: number;
  /** 上行幅度（百分比，正数） */
  upside: number;
  /** 置信水平（百分比，如 95） */
  confidence: number;
  /** 区间对应的时间跨度（月） */
  periodMonths: number;
}

/** 复合分维度分解（透明暴露各维贡献，仅当 valuation 或 risk 参与运算时存在） */
export interface CompositeBreakdown {
  /** 技术面映射分（0-100） */
  technical: number;
  /** 基本面映射分（0-100） */
  fundamental: number;
  /** 估值映射分（低估上偏 / 高估下偏，按估值置信度缩放）；缺估值数据时为空 */
  valuation?: number;
  /** 风险调制系数（high=0.85，其余=1）；<1 表示高波动把分数向中性 50 收敛 */
  riskPull?: number;
}

/** 个股资金流向（东财，最新一日，主力/超大/大/中/小单净流入，单位元；A 股专属，美股为空） */
export interface FundFlowData {
  /** 数据日期（YYYY-MM-DD，东财数据延迟约一日） */
  date: string;
  /** 主力净流入（元，正流入负流出） */
  mainNet: number;
  /** 超大单净流入（元） */
  superLargeNet: number;
  /** 大单净流入（元） */
  largeNet: number;
  /** 中单净流入（元） */
  mediumNet: number;
  /** 小单净流入（元） */
  smallNet: number;
  /** 主力净流入占成交额比例（%） */
  mainNetPct: number;
}

/** AI 关键价位（叠加到 K 线的水平线）。数值均由 quant 维度已算出的中间量推导，非新造计算 */
export interface PriceLevel {
  /** 价格（每股，与 K 线同坐标） */
  price: number;
  /** 类型：驱动颜色 + 基础标签（支撑/阻力/目标价/止损） */
  type: 'support' | 'resistance' | 'target' | 'stopLoss';
  /** 推导来源稳定标识（'boll_lower'|'boll_upper'|'valuation'|'atr'），前端据此补充括注标签 */
  source: string;
}

/** 量化分析数据包（技术面 + 基本面 + 估值 + 风险，不含情绪——情绪由 LLM 综合研判） */
export interface QuantBundle {
  symbol: string;
  technical: AnalystSignal;
  fundamental: AnalystSignal;
  composite: {
    signal: 'bullish' | 'bearish' | 'neutral';
    score: number;
    /** 四维分解：缺 valuation 且缺 risk 时为空（复合分退化为技术+基本面两维，与历史口径一致） */
    breakdown?: CompositeBreakdown;
  };
  fetchedAt: number;
  valuation?: ValuationSnapshot;
  risk?: RiskSnapshot;
  /** 资金流向（仅 A 股） */
  fundFlow?: FundFlowData;
  /** AI 关键价位（数据不足时为空数组，前端 guard 不画） */
  levels?: PriceLevel[];
}

/**
 * 一期财报快照（东财 F10 RPT_F10_FINANCE_MAINFINADATA 的一行）。
 * 与 FinancialMetrics 重叠的字段（roe/grossMargin/netMargin/debtToAsset/currentRatio/
 * revenueGrowth/netIncomeGrowth/revenue/netIncome）语义与单位一致，另加时序专属的
 * reportDate/reportType/eps/bps。所有指标可能缺失（东财按报告期披露不齐），故全部可选。
 */
export interface FinancialSnapshot {
  reportDate: string; // YYYY-MM-DD 报告期（REPORT_DATE，已从 "YYYY-MM-DD 00:00:00" 裁剪）
  reportType: string; // '年报'|'一季报'|'中报'|'三季报'（REPORT_TYPE）
  roe?: number; // ROEJQ 加权 ROE(%)
  grossMargin?: number; // XSMLL 销售毛利率(%)
  netMargin?: number; // XSJLL 销售净利率(%)
  debtToAsset?: number; // ZCFZL 资产负债率(%)
  currentRatio?: number; // LD 流动比率
  revenueGrowth?: number; // TOTALOPERATEREVETZ 营收同比(%)
  netIncomeGrowth?: number; // PARENTNETPROFITTZ 归母净利同比(%)
  revenue?: number; // TOTALOPERATEREVE 营收绝对值(元)
  netIncome?: number; // PARENTNETPROFIT 归母净利绝对值(元)
  eps?: number; // EPSJB 基本每股收益(元)
  bps?: number; // BPS 每股净资产(元)——配合 K 线收盘可推历史 PB
  operatingCashFlowPerShare?: number; // MGJYXJJE 每股经营现金流(元/股)
}

/** 历史财务时序（按需从东财逐期拉取，24h 磁盘缓存；初版仅 A 股） */
export interface FinancialHistory {
  symbol: string; // 原始输入代码
  market: Market; // 初版恒为 'A股'；美股历史留待后续扩展
  snapshots: FinancialSnapshot[]; // 按 reportDate 降序，最新在前
  fetchedAt: number; // 拉取时刻（Unix 毫秒）
}

/**
 * 大师专属预计算因子（#12）——多期年报时序 → 结构化因子。
 * 由 sidecar 的 computeFactors(history) 纯函数产出，注入价值派大师 prompt。
 * v1 纯 sidecar 内部消费：不进 DeepAnalysisResult、不跨层到 Rust/前端（放此仅为将来前端因子面板铺路）。
 */
export interface MasterFactors {
  available: boolean; // false → 年报<3 期/非A股 → 大师回退单期快照行为
  asOf?: string; // 最新年报 reportDate（YYYY-MM-DD）
  annualPeriods: number; // 参与计算的年报期数
  roeConsistency?: RoeConsistencyFactor;
  marginTrend?: MarginTrendFactor;
  debtTrend?: DebtTrendFactor;
  growthStability?: GrowthStabilityFactor;
  simpleDcf?: SimpleDcfFactor;
}

/** 护城河代理指标：ROE 多年持续性（对标 ai-hedge-fund analyze_moat） */
export interface RoeConsistencyFactor {
  threshold: number; // 判定阈值(%)，默认 15
  streak: number; // 从最新年报起连续 roe>threshold 的期数（遇缺失/不达标即中断）
  periodsAbove: number; // 全部 roe>threshold 的年报数
  totalPeriods: number; // roe 非空的年报数
  avgRoe: number; // 年报 roe 均值(%)
  verdict: 'wide' | 'narrow' | 'none'; // 宽阔护城河 / 中等 / 不明显
}

/** 单一利润率的趋势（毛利率/净利率共用） */
export interface MarginDirection {
  latest: number; // 最新年报值(%)
  direction: 'up' | 'down' | 'flat'; // 死区 ±1pp 去抖
  deltaPp: number; // latest - 最早可比点（百分点）
}

/** 盈利质量趋势（对标 analyze_consistency） */
export interface MarginTrendFactor {
  gross?: MarginDirection;
  net?: MarginDirection;
}

/** 财务实力趋势：资产负债率走向（对标 analyze_financial_strength） */
export interface DebtTrendFactor {
  latest: number; // 最新年报资产负债率(%)
  avg: number; // 年报均值(%)
  direction: 'falling' | 'stable' | 'rising'; // 去杠杆 / 平稳 / 加杠杆，死区 ±2pp
}

/** 单一增长序列的稳定性（营收/净利同比共用） */
export interface GrowthSeriesStability {
  avgGrowth: number; // 同比均值(%)
  positivePeriods: number; // >0 的期数
  totalPeriods: number; // 非空期数
  stability: 'stable' | 'volatile'; // 全正且低变异 / 有负增长或高波动
}

/** 增长稳定性（Graham 盈利稳定性 / Lynch GARP / Fisher 持续成长的核心） */
export interface GrowthStabilityFactor {
  revenue?: GrowthSeriesStability;
  netIncome?: GrowthSeriesStability;
}

/**
 * 简化每股内在价值（两阶段 DCF 粗估，作交叉验证，非权威口径）。
 * 权威安全边际仍归 quant.valuation（对 marketCap 的三情景 DCF）。
 */
export interface SimpleDcfFactor {
  intrinsicValuePerShare: number; // 每股内在价值(元)
  basis: 'ocfps' | 'eps'; // 计算口径：每股经营现金流 / 每股收益
  assumedGrowthPct: number; // 假设增速(%)，已钳到 0..15
  note: string; // 口径说明（明确非权威）
}

/**
 * 全市场横截面一行（东财 push2 clist 的一条）。
 * clist 仅可靠携带估值+行情字段；ROE/负债率/增速等深层财报字段留空，由候选精拉
 * （--quant / --fundamentals-history）补齐（两阶段筛选，见蓝图 §3）。
 */
export interface MarketSnapshotEntry {
  symbol: string; // 6 位代码（f12）
  name: string; // f14
  price?: number; // f2 最新价
  changePercent?: number; // f3 涨跌幅(%)
  pe?: number; // f9 动态市盈率
  pb?: number; // f23 市净率
  marketCap?: number; // f20 总市值(元)
  turnoverRate?: number; // f8 换手率(%)
}

/** 全市场基本面快照（分页串行拉 clist 聚合，24h 磁盘缓存） */
export interface MarketSnapshot {
  entries: MarketSnapshotEntry[];
  fetchedAt: number; // 拉取时刻（Unix 毫秒）
  total: number; // 东财声明的全市场标的总数（用于校验分页是否拉全）
}

/** 一个板块（行业或概念）的当日表现 */
export interface SectorRank {
  code: string; // 板块代码，如 BK0899
  name: string; // 板块名，如 CRO
  changePercent: number; // 板块涨跌幅(%)
  // 以下三项**可选**：东财给，新浪（东财整机故障时的备源）不给。
  // 缺了要让 UI 显示「—」，绝不能填 0——「主力净流入 0」会被读成"没有资金进出"，
  // 那是一句我们并不知道的断言。
  mainNetInflow?: number; // 主力净流入(元)
  advancers?: number; // 板块内上涨家数
  decliners?: number; // 板块内下跌家数
  leader?: { name: string; symbol: string; changePercent: number }; // 领涨股
}

/** 板块涨幅榜：行业与概念各一份 */
export interface SectorBoards {
  industry: SectorRank[];
  concept: SectorRank[];
  fetchedAt: number; // 拉取时刻（Unix 毫秒）
}

/**
 * 龙虎榜单条记录。
 *
 * **一只股票一天可能出现多条**——同日触发多个上榜标准（如「日涨幅偏离7%」与
 * 「连续三日累计20%」）会各出一条，且净额按各自的统计窗口计算，彼此不等
 * （实测 000603 同日两条为 +1.13 亿 / −0.29 亿）。因此这里以「一条上榜记录」
 * 而非「一只股票」为单位，`reason` 必须与数字一起显示。
 */
export interface BillboardEntry {
  symbol: string; // 6 位代码
  name: string;
  price: number; // 当日收盘价
  changePercent: number; // 当日涨跌幅(%)
  netAmount: number; // 龙虎榜净买额(元)，负数为净卖出
  buyAmount: number; // 龙虎榜买入额(元)
  sellAmount: number; // 龙虎榜卖出额(元)
  turnover: number; // 当日总成交额(元)
  netRatio: number; // 净买额占总成交额比(%)
  reason: string; // 上榜原因（交易所口径原文）
}

/** 龙虎榜：最新交易日的净买入 / 净卖出两张榜 */
export interface Billboard {
  tradeDate: string; // 榜单归属交易日，YYYY-MM-DD
  topBuy: BillboardEntry[]; // 净买入额降序
  topSell: BillboardEntry[]; // 净卖出额降序（netAmount 升序）
  fetchedAt: number; // 拉取时刻（Unix 毫秒）
}
