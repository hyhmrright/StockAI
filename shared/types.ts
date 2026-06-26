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

/** 对话式追问的单条历史消息（不含 system，system 由 sidecar 按上下文构建） */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 对话式追问上下文：精简自当前股票的新闻/量化/已有分析，避免重复抓取与超长 payload */
export interface ChatContext {
  newsTitles?: string[]; // 近期新闻标题
  quantSummary?: string; // 量化评分摘要（如「综合 72/100，技术面看涨」）
  analysisSummary?: string; // 已有 AI 分析的结论摘要
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
  reply: string;
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
