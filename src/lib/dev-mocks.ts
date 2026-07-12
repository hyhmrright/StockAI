import type {
  StockInfo,
  StockSearchResult,
  KlinePoint,
  RealtimeQuote,
  MarketBundle,
  StockNews,
  AIAnalysisResult,
  QuantBundle,
  DeepAnalysisResult,
  BacktestResult,
  ChatResponse,
  ScreenResponse,
} from '../../shared/types';

/**
 * Dev / 浏览器模式专用 mock 数据集合
 * 只在 `!isTauri()` 分支与 dev bridge 不在线时使用，生产桌面构建路径不会引用本文件。
 */

export const MOCK_STOCKS: StockSearchResult[] = [
  { name: '苹果公司', code: 'AAPL', type: '美股', fullCode: 'gb_aapl' },
  { name: '隆基绿能', code: '601012', type: 'A股', fullCode: 'sh601012' },
];

export const MOCK_STOCK_INFO: StockInfo = {
  name: '苹果公司',
  code: 'AAPL',
  exchange: 'NASDAQ',
  market: '美股',
  price: 180.5,
  change: 2.5,
  changePercent: 1.4,
  currency: 'USD',
};

export const MOCK_MODELS: string[] = ['gpt-4o', 'gpt-4o-mini', 'ollama-dev'];

/** 30 根 1d 周期 K 线，最后一根对齐今天，便于与 quote 合并测试 */
export const MOCK_KLINE: KlinePoint[] = Array.from({ length: 30 }, (_, i) => {
  const base = 180 + Math.sin(i / 5) * 5;
  return {
    time: Math.floor(Date.now() / 1000) - (29 - i) * 86400,
    open: base,
    high: base + 2,
    low: base - 2,
    close: base + (Math.random() - 0.5) * 3,
    volume: 50_000_000 + Math.random() * 10_000_000,
  };
});

export const MOCK_NEWS: StockNews[] = [
  {
    title: '苹果发布会预告：M5 芯片性能再次跃迁',
    source: 'TechCrunch',
    date: '2026-05-22',
    content: '（mock）苹果将于下周发布会上展示 M5 芯片，预计单核性能提升 25%。',
    url: 'https://example.com/news/1',
  },
  {
    title: 'AAPL Q2 财报超预期：服务业务首次突破 300 亿美元',
    source: 'Reuters',
    date: '2026-05-21',
    content: '（mock）服务业务同比增长 18%，毛利率维持高位。',
    url: 'https://example.com/news/2',
  },
];

export const MOCK_BUNDLE: MarketBundle = {
  symbol: 'AAPL',
  stockInfo: MOCK_STOCK_INFO,
  news: MOCK_NEWS,
};

export const MOCK_AI_RESULT: AIAnalysisResult = {
  rating: 72,
  sentiment: 'bullish',
  summary: '（mock）整体看涨：核心业务表现稳健，AI 战略推进顺利。',
  pros: ['服务业务增长', 'M5 芯片亮点', '现金流充裕'],
  cons: ['大盘估值偏高', '中国市场不确定性'],
};

export const MOCK_QUOTE: RealtimeQuote = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  price: 180.5,
  change: 2.5,
  changePercent: 1.4,
  open: 179,
  high: 182,
  low: 178.5,
  prevClose: 178,
  volume: 55_000_000,
  amount: 9_900_000_000,
  high52w: 200,
  low52w: 150,
  timestamp: Math.floor(Date.now() / 1000),
  currency: 'USD',
  market: '美股',
};

export const MOCK_DEEP_ANALYSIS: DeepAnalysisResult = {
  masterSignals: [
    {
      masterId: 'warren-buffett',
      signal: 'bullish',
      confidence: 85,
      reasoning: '护城河深厚，ROE 持续优秀',
    },
    {
      masterId: 'ben-graham',
      signal: 'neutral',
      confidence: 60,
      reasoning: 'PE 偏高，安全边际不足',
    },
    {
      masterId: 'michael-burry',
      signal: 'bearish',
      confidence: 55,
      reasoning: '估值过高，存在回调风险',
    },
    { masterId: 'cathie-wood', signal: 'bullish', confidence: 90, reasoning: '创新驱动力强' },
    {
      masterId: 'aswath-damodaran',
      signal: 'bullish',
      confidence: 72,
      reasoning: '增长叙事支撑估值',
    },
  ],
  sentiment: {
    signal: 'bullish',
    confidence: 70,
    newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
  },
  synthesis: {
    signal: 'bullish',
    confidence: 78,
    summary: '多数投资大师看好该股的长期价值，核心优势在于竞争护城河和持续盈利能力。',
    consensus: 75,
  },
};

export const MOCK_QUANT: QuantBundle = {
  symbol: 'AAPL',
  technical: {
    signal: 'bullish',
    confidence: 72,
    details: { rsi: 45, adx: 28, alignment: 'bullish', volume_ratio: 1.3, macd_trend: 'expanding' },
  },
  fundamental: {
    signal: 'neutral',
    confidence: 55,
    details: { roe: 16.5, pe: 22, net_margin: 12, pb: 2.8 },
  },
  composite: { signal: 'bullish', score: 68 },
  fetchedAt: Date.now(),
};

export const MOCK_BACKTEST: BacktestResult = {
  symbol: 'MOCK',
  totalReturn: 0.15,
  annualizedReturn: 0.12,
  maxDrawdown: -0.08,
  winRate: 0.6,
  totalTrades: 8,
  sharpeRatio: 1.2,
  buyAndHoldReturn: 0.2,
  trades: [],
  equityCurve: [],
};

/**
 * #14 NL 选股 mock：模拟「ROE≥15 且 PE<20 的沪深主板股票」的两阶段筛选结果。
 * 含 fine 条件（roe）故 refinedCount>0；每只带 quant.composite.score 供表格展示综合分。
 */
export const MOCK_SCREEN: ScreenResponse = {
  query: {
    conditions: [
      { field: 'roe', op: 'gte', value: 15 },
      { field: 'pe', op: 'lt', value: 20 },
    ],
    board: 'main',
    limit: 30,
    sortBy: { field: 'compositeScore', order: 'desc' },
  },
  matches: [
    {
      symbol: '600519',
      name: '贵州茅台',
      snapshot: {
        symbol: '600519',
        name: '贵州茅台',
        price: 1685.5,
        changePercent: 0.82,
        pe: 18.4,
        pb: 6.9,
        marketCap: 2_117_000_000_000,
        turnoverRate: 0.21,
      },
      quant: {
        symbol: '600519',
        technical: { signal: 'bullish', confidence: 70, details: {} },
        fundamental: { signal: 'bullish', confidence: 82, details: { roe: 31.2 } },
        composite: { signal: 'bullish', score: 78 },
        fetchedAt: Date.now(),
      },
    },
    {
      symbol: '601166',
      name: '兴业银行',
      snapshot: {
        symbol: '601166',
        name: '兴业银行',
        price: 18.32,
        changePercent: -0.43,
        pe: 5.6,
        pb: 0.55,
        marketCap: 380_500_000_000,
        turnoverRate: 0.38,
      },
      quant: {
        symbol: '601166',
        technical: { signal: 'neutral', confidence: 55, details: {} },
        fundamental: { signal: 'bullish', confidence: 68, details: { roe: 15.8 } },
        composite: { signal: 'neutral', score: 62 },
        fetchedAt: Date.now(),
      },
    },
  ],
  scannedCoarse: 47,
  refinedCount: 30,
  fetchedAt: Date.now(),
};

export const MOCK_CHAT: ChatResponse = {
  // 内含 [[cite:0]]/[[cite:1]]/[[cite:2]] token，便于浏览器 dev 模式自测角标渲染（含 report 类型）
  reply:
    '（开发模式 mock 回复）近期基本面稳健[[cite:0]]，量化模型也给出偏多信号[[cite:1]]，业绩说明会亦提到营收增长来自高端产品放量[[cite:2]]。启动 sidecar bridge 可获得真实 AI 回复。',
  citations: [
    {
      index: 0,
      sourceType: 'news',
      sourceRef: 1,
      snippet: '示例新闻标题：公司发布季度财报，营收超预期',
    },
    {
      index: 1,
      sourceType: 'quant',
      sourceRef: 'summary',
      snippet: '综合 72/100（看涨）',
    },
    {
      index: 2,
      sourceType: 'report',
      sourceRef: 1,
      snippet: '问：营收增长的主要驱动是什么？答：主要来自高端产品结构优化与渠道扩张。',
      sourceUrl: 'http://static.cninfo.com.cn/finalpage/example.PDF',
      sourceMeta: { title: '2023 年度业绩说明会记录', date: '2024-04-01', position: '问答 #7' },
    },
  ],
};
