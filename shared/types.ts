// 跨层共享的数据类型定义（前端 + Sidecar 的唯一来源）
/**
 * 服务端错误对象
 */
export interface ServiceErrorPayload {
  code: string; // 错误码，如 'ERR_SCRAPE_EMPTY', 'ERR_AI_AUTH'
  message: string; // 人类可读的消息
}

/**
 * 成功信封
 */
export interface SuccessEnvelope<T> {
  data: T;
  error?: never;
}

/**
 * 失败信封
 */
export interface ErrorEnvelope {
  data?: never;
  error: ServiceErrorPayload;
}

/**
 * 统一的业务响应信封（discriminated union；data 与 error 互斥）
 */
export type ServiceResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** AI 服务提供商类型 */
export type ProviderType = 'openai' | 'ollama' | 'anthropic' | 'deepseek' | 'glm';

/**
 * LLM 角色：不同任务可指定不同模型，让核心研判用聪明模型、廉价批量活用便宜模型。
 * - brain：核心研判（基础 AI 分析 + 13 位大师 + 综合结论）
 * - quick：快速标注（新闻情绪逐条分类）
 * - summarize：对话追问（基于已有上下文的多轮问答）
 */
export type Role = 'brain' | 'quick' | 'summarize';

/**
 * 单个角色的模型选择：只决定「用哪个 provider 的哪个 model」；
 * apiKey/baseUrl 一律从 providerConfigs[provider] 取，不在此重复存储。
 */
export interface ModelChoice {
  provider: ProviderType;
  model: string;
}

/**
 * 角色 → 模型选择映射（Partial：某角色缺省时回退到 activeProvider）。
 * 默认为空对象，即所有角色都跟随当前活跃 provider，开箱行为与历史一致。
 */
export type RoleModels = Partial<Record<Role, ModelChoice>>;

/** 界面与 AI 回答语言 */
export type Language = 'zh' | 'en' | 'ja';

/**
 * 股票新闻数据接口
 */
export interface StockNews {
  title: string; // 新闻标题
  source: string; // 新闻来源（域名或媒体名称）
  date: string; // 发布日期，格式为 YYYY-MM-DD（无法解析时为原始字符串）
  content: string; // 新闻内容（Markdown 格式；深度模式下为完整正文，否则为摘要或空字符串）
  url: string; // 新闻原文链接
}

/** 溯源角标的来源类型 */
export type CitationSourceType = 'news' | 'quant' | 'analysis' | 'report';

/**
 * RAG 检索回的单条投资者互动问答片段（沪市上证e互动 / 深市互动易）。
 * 由 sidecar 在 handleChat 内注入 ChatContext（前端不填），驱动 report 类型溯源角标。
 */
export interface ReportChunk {
  text: string; // chunk 正文（问答段，「问：…\n答：…」），已截断到长度上限
  docTitle: string; // 固定为「投资者互动问答」
  docDate: string; // 回答发布日期 YYYY-MM-DD
  url?: string; // 来源页面链接（供 badge「查看原文」复用）
  position?: string; // 片段位置，如「问答 #7」
}

/**
 * AI 回答里的一条溯源角标（sidecar 校验通过后才产生）。
 * 关键红线：错误来源比无来源更糟——每条 citation 的 snippet 都由 sidecar 从「本次真实传入的 context」取值，
 * 不信任 LLM 声称的内容；校验不过的标记被静默删除，不会产生 citation。
 */
export interface ChatCitation {
  index: number; // 与 reply 中 [[cite:index]] token 对应，即 citations 数组下标
  sourceType: CitationSourceType;
  sourceRef: number | string; // news→1-based 序号；quant/analysis→'summary' 哨兵
  snippet: string; // 被引用的原文片段（新闻标题 / 量化摘要 / 分析结论 / 财报问答段），取自本次 context
  label?: string; // 可选：角标本地化标题；实际由前端按 useLanguage() 派生，sidecar 不生成
  sourceUrl?: string; // 仅 report 用：来源页面链接；report 无前端 ref 数组，链接必须自带
  sourceMeta?: { title: string; date: string; position?: string }; // 仅 report 用：来源行渲染（标题/日期/片段位置）
}

/** 对话式追问的单条历史消息（不含 system，system 由 sidecar 按上下文构建） */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[]; // 仅 assistant 消息可能携带，随多轮历史持久化
}

/** 对话式追问上下文：精简自当前股票的新闻/量化/已有分析，避免重复抓取与超长 payload */
export interface ChatContext {
  newsTitles?: string[]; // 近期新闻标题
  quantSummary?: string; // 量化评分摘要（如「综合 72/100，技术面看涨」）
  analysisSummary?: string; // 已有 AI 分析的结论摘要
  reportChunks?: ReportChunk[]; // 财报/说明会 RAG 检索片段；前端不填，sidecar 在 handleChat 内注入
}

/** 对话式追问请求（前端 → Rust → Sidecar） */
export interface ChatPayload {
  symbol: string;
  question: string;
  history: ChatMessage[]; // 之前的多轮对话
  context: ChatContext;
}

/** 对话式追问响应 */
export interface ChatResponse {
  reply: string; // 已清洗：[src:...] 均被删除或改写为 [[cite:N]]
  citations?: ChatCitation[]; // 校验通过的溯源角标，可能为空数组
}

/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  rating: number; // 综合评分，范围 1-100（50 为中性基准）
  sentiment: 'bullish' | 'bearish' | 'neutral'; // 情绪：看涨、看跌、中性
  summary: string; // 简要总结
  pros: string[]; // 利多理由
  cons: string[]; // 利空/风险因素
  sector?: string; // 所属板块
  industry?: string; // 所属行业
  description?: string; // 公司业务描述
  technicalView?: string; // LLM 对技术面的文字解读
  fundamentalView?: string; // LLM 对基本面的文字解读
}

/**
 * 股票基本信息（来自 Sina Finance / Yahoo Finance）
 */
export interface StockInfo {
  name: string; // 股票全称
  code: string; // 标准化代码（如 688693）
  exchange: string; // 交易所名称（科创板 / 上交所 / 深交所 / 北交所 / NASDAQ / NYSE）
  market: string; // 市场（A股 / 美股）
  price?: number; // 最新价
  change?: number; // 涨跌额
  changePercent?: number; // 涨跌幅 %
  currency: string; // 货币（CNY / USD）
}

/**
 * 股票搜索结果
 */
export interface StockSearchResult {
  name: string;
  code: string;
  type: string; // 股票类型：A股、美股、港股等
  fullCode: string; // 完整带市场前缀的代码（用于新浪接口，如 sh601012, gb_aapl）
  price?: number; // 最新价
  change?: number; // 涨跌额
  changePercent?: number; // 涨跌幅 %
}

/**
 * 完整的股票分析响应
 */
export interface FullAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
  analysis: AIAnalysisResult;
}

/**
 * 只抓数据、不调 LLM 的数据包；用户点 "AI 分析" 按钮前先展示这部分
 */
export interface MarketBundle {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
}

/**
 * K 线粒度
 */
export type KlinePeriod = '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1w' | '1mo';

/**
 * 时间范围（UI 选择器）
 * 注意：此处的 "1m" 表示 1 个月，与 KlinePeriod 的 "1m"（1 分钟）含义不同。
 */
export type KlineRange = '1d' | '5d' | '1m' | '3m' | '6m' | 'ytd' | '1y' | '5y' | 'all';

/**
 * 市场归属（按 symbol 自动识别）
 */
export type Market = 'A股' | '美股';

/**
 * 复权方式
 */
export type AdjustMode = 'qfq' | 'hfq' | 'none';

/**
 * 一根 K 线
 */
export interface KlinePoint {
  time: number; // Unix 秒 (UTC)，对齐到周期起点
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 股数；A 股原始是手数，已 × 100
  amount?: number; // 成交额（人民币 / 美元）
}

/**
 * 一次 K 线拉取请求
 */
export interface KlineRequest {
  symbol: string; // 原始用户输入（"600519" / "AAPL" / "sh600519"）
  period: KlinePeriod;
  range: KlineRange;
  adjust?: AdjustMode; // 默认 "qfq"
}

/**
 * 实时报价
 */
export interface RealtimeQuote {
  symbol: string;
  name: string; // 显示名（A 股中文名 / 美股英文短名）
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number; // 股数
  amount: number; // 成交额
  turnoverRate?: number; // 换手率 %（A 股）
  marketCap?: number; // 总市值
  pe?: number;
  pb?: number;
  high52w?: number;
  low52w?: number;
  preMarket?: { price: number; change: number; changePercent: number };
  postMarket?: { price: number; change: number; changePercent: number };
  timestamp: number; // 报价时间 Unix 秒
  currency: 'CNY' | 'USD'; // 货币
  market: Market;
}

/** 单维度分析信号 */
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

/** 投资大师元信息 */
export interface MasterMeta {
  id: string;
  name: string;
  nameZh: string;
  style: string;
  styleZh: string;
  description: string;
}

/** 单个大师的分析信号 */
export interface MasterSignal {
  masterId: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

/**
 * 大师动态权重输入：前端从虚拟组合榜单（命中判定的单一真源）算好后经参数注入 sidecar。
 * 跨层契约——sidecar 直接消费，hitRate = hits/sampleSize 由 sidecar 需要时自算。
 */
export interface MasterWeightInput {
  masterId: string;
  sampleSize: number; // 已裁决方向 signal 数（映射自 MasterLeaderboardEntry.resolved）
  hits: number; // 方向兑现次数
}

/** 情绪分析信号 */
export interface SentimentSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  newsBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
}

/** 深度分析综合结果 */
export interface DeepAnalysisResult {
  masterSignals: MasterSignal[];
  sentiment: SentimentSignal;
  synthesis: {
    signal: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    summary: string;
    consensus: number;
  };
}

/** 落账后的单条大师 signal（master_signals 表一行；虚拟组合前向跟踪原始记录） */
export interface MasterSignalRecord {
  id: number;
  masterId: string;
  symbol: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  priceAt: number | null; // 落账当时价；null 表示未捕获到入场价，无法纳入命中率/净值
  recordedAt: number; // Unix 毫秒
}

/** 大师战绩榜单一行（命中率 + 平均收益，自记录至今 mark-to-current 口径） */
export interface MasterLeaderboardEntry {
  masterId: string;
  total: number; // 该大师落账的全部 signal 数（含中性/未定价）
  resolved: number; // 已可裁决的方向 signal 数（有入场价 + 有现价 + 非中性）
  pending: number; // 待定 signal 数（中性 / 缺价，未纳入统计）
  hits: number; // 方向兑现次数
  hitRate: number | null; // hits / resolved；resolved 为 0 时为 null
  avgReturn: number | null; // 已裁决 signal 的方向调整收益均值；resolved 为 0 时为 null
  lastSignalAt: number; // 最近一次落账时间（Unix 毫秒）
}

/** 净值曲线一个点（按时间顺序等额全仓复利，含未平仓浮盈） */
export interface MasterNavPoint {
  time: number; // 对应 signal 的 recordedAt（Unix 毫秒）
  value: number; // 归一化净值，起点 1.0
}

/** 虚拟大师组合展示层聚合结果 */
export interface MasterPortfolioData {
  leaderboard: MasterLeaderboardEntry[]; // 已按命中率降序排好
  navCurves: Record<string, MasterNavPoint[]>; // masterId → 净值曲线
  totalSignals: number;
  resolvedSignals: number;
  firstSignalAt: number | null; // 样本起始（Unix 毫秒），披露时间窗用
  asOf: number; // 计算时刻（Unix 毫秒）
}

/** 回测交易记录 */
export interface TradeRecord {
  type: 'buy' | 'sell';
  date: number;
  price: number;
  shares: number;
  value: number;
  score: number;
}

/** 回测结果 */
export interface BacktestResult {
  symbol: string;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
  buyAndHoldReturn: number;
  trades: TradeRecord[];
  equityCurve: Array<{ time: number; value: number }>;
}

/** 分析类型 */
export type AnalysisType = 'ai' | 'deep' | 'quant' | 'backtest' | 'screener';

/** 筛选器单项结果 */
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

/** 分析历史记录摘要（列表查询用，不含 news_json） */
export interface AnalysisRecordSummary {
  id: number;
  symbol: string;
  analyzedAt: number;
  type: AnalysisType;
  resultJson: string;
  stockInfoJson: string | null;
}

/** 分析历史完整记录（含 news_json） */
export interface AnalysisRecord extends AnalysisRecordSummary {
  newsJson: string | null;
}

/** 保存分析记录的参数 */
export interface SaveAnalysisParams {
  symbol: string;
  analysisType: AnalysisType;
  resultJson: string;
  stockInfoJson?: string;
  newsJson?: string;
}

/** 查询历史记录的参数 */
export interface HistoryQuery {
  symbol: string;
  analysisType?: AnalysisType;
  limit?: number;
  offset?: number;
}
