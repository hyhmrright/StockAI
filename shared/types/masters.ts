// 投资大师多智能体：单师信号、情绪综合、深度分析结果与虚拟组合前向跟踪
/** 投资大师元信息 */
export interface MasterMeta {
  id: string;
  name: string;
  nameZh: string;
  style: string;
  styleZh: string;
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
