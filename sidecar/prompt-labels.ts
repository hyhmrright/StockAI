import type { Language } from '../shared/types';

/**
 * 送进 LLM 的三语标签表——**纯数据，不含任何逻辑**。
 *
 * 与 `src/i18n/*.json` 是两套东西，刻意不合并：那边是 UI 文案（面向读者、由 `useLanguage`
 * 取用、`zh.json` 是 key 的类型来源），这边是 prompt 里喂给模型的字段名。两者的修改动机、
 * review 标准、改错的后果都不同——改 UI 文案最多难看，改这里会改变模型的输出。
 *
 * 从 `prompts.ts` 拆出，只是因为这 220 余行数据把那边的格式化逻辑挤到了 544 行开外。
 */

export interface QuantLabels {
  header: string;
  technical: string;
  fundamental: string;
  bullish: string;
  bearish: string;
  neutral: string;
  bullish_align: string;
  bearish_align: string;
  mixed_align: string;
  oversold: string;
  overbought: string;
  neutral_range: string;
  macd_expanding: string;
  macd_contracting: string;
  adx_strong: string;
  adx_weak: string;
  confidence: string;
  macd_hist: string;
  ema_align: string;
  rsi: string;
  macd: string;
  adx: string;
  vol: string;
  vol_vs: string;
  composite: string;
  low_risk: string;
  medium_risk: string;
  high_risk: string;
  risk_level: string;
  vol_annual: string;
  max_dd: string;
  sharpe: string;
  net_margin: string;
  revenue_growth: string;
  debt_to_asset: string;
}

export const QUANT_LABELS: Record<Language, QuantLabels> = {
  zh: {
    header: '[量化分析摘要]',
    technical: '技术面信号',
    fundamental: '基本面信号',
    bullish: '看涨',
    bearish: '看跌',
    neutral: '中性',
    bullish_align: '多头排列',
    bearish_align: '空头排列',
    mixed_align: '交叉纠缠',
    oversold: '（超卖）',
    overbought: '（超买）',
    neutral_range: '（中性区间）',
    macd_expanding: '放大',
    macd_contracting: '收缩',
    adx_strong: '（趋势明确）',
    adx_weak: '（趋势较弱）',
    confidence: '置信度',
    macd_hist: '柱状量',
    ema_align: 'EMA 排列',
    rsi: 'RSI(14)',
    macd: 'MACD',
    adx: 'ADX',
    vol: '成交量比',
    vol_vs: '（相对20日均量）',
    composite: '综合量化评分',
    low_risk: '低风险',
    medium_risk: '中风险',
    high_risk: '高风险',
    risk_level: '风险等级',
    vol_annual: '年化波动率',
    max_dd: '最大回撤',
    sharpe: '夏普比率',
    net_margin: '净利率',
    revenue_growth: '营收增长',
    debt_to_asset: '资产负债率',
  },
  en: {
    header: '[Quantitative Analysis Summary]',
    technical: 'Technical Signal',
    fundamental: 'Fundamental Signal',
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
    bullish_align: 'Bullish alignment',
    bearish_align: 'Bearish alignment',
    mixed_align: 'Tangled',
    oversold: ' (Oversold)',
    overbought: ' (Overbought)',
    neutral_range: ' (Neutral zone)',
    macd_expanding: 'expanding',
    macd_contracting: 'contracting',
    adx_strong: ' (Strong trend)',
    adx_weak: ' (Weak trend)',
    confidence: 'Confidence',
    macd_hist: 'histogram ',
    ema_align: 'EMA alignment',
    rsi: 'RSI(14)',
    macd: 'MACD',
    adx: 'ADX',
    vol: 'Volume ratio',
    vol_vs: ' (vs 20-day avg)',
    composite: 'Composite quant score',
    low_risk: 'Low',
    medium_risk: 'Medium',
    high_risk: 'High',
    risk_level: 'Risk Level',
    vol_annual: 'Annualized volatility',
    max_dd: 'Max drawdown',
    sharpe: 'Sharpe ratio',
    net_margin: 'Net margin',
    revenue_growth: 'Revenue growth',
    debt_to_asset: 'Debt/asset',
  },
  ja: {
    header: '[定量分析サマリー]',
    technical: 'テクニカルシグナル',
    fundamental: 'ファンダメンタルシグナル',
    bullish: '強気',
    bearish: '弱気',
    neutral: '中立',
    bullish_align: '強気配列',
    bearish_align: '弱気配列',
    mixed_align: '交錯',
    oversold: '（売られ過ぎ）',
    overbought: '（買われ過ぎ）',
    neutral_range: '（中立ゾーン）',
    macd_expanding: '拡大中',
    macd_contracting: '縮小中',
    adx_strong: '（トレンド明確）',
    adx_weak: '（トレンド弱い）',
    confidence: '信頼度',
    macd_hist: '',
    ema_align: 'EMA配列',
    rsi: 'RSI(14)',
    macd: 'MACDヒストグラム',
    adx: 'ADX',
    vol: '出来高比率',
    vol_vs: '（20日平均比）',
    composite: '総合クオンツスコア',
    low_risk: '低',
    medium_risk: '中',
    high_risk: '高',
    risk_level: 'リスクレベル',
    vol_annual: '年率ボラティリティ',
    max_dd: '最大ドローダウン',
    sharpe: 'シャープレシオ',
    net_margin: '純利益率',
    revenue_growth: '売上成長率',
    debt_to_asset: '負債比率',
  },
};

interface ValuationLabels {
  header: string;
  intrinsic: string;
  market_cap: string;
  margin: string;
  signal: string;
  undervalued: string;
  overvalued: string;
  fair: string;
  dcf_wacc: string;
  bear: string;
  base: string;
  bull: string;
  relative: string;
  owner_earnings: string;
  unit: string;
}

export const VALUATION_LABELS: Record<Language, ValuationLabels> = {
  zh: {
    header: '[估值分析]',
    intrinsic: '内在价值估算',
    market_cap: '当前市值',
    margin: '安全边际',
    signal: '估值信号',
    undervalued: '低估',
    overvalued: '高估',
    fair: '合理',
    dcf_wacc: 'DCF (WACC',
    bear: '悲观',
    base: '基准',
    bull: '乐观',
    relative: '相对估值',
    owner_earnings: 'Owner Earnings',
    unit: '亿',
  },
  en: {
    header: '[Valuation Analysis]',
    intrinsic: 'Intrinsic value estimate',
    market_cap: 'Current market cap',
    margin: 'Margin of safety',
    signal: 'Valuation signal',
    undervalued: 'Undervalued',
    overvalued: 'Overvalued',
    fair: 'Fair value',
    dcf_wacc: 'DCF (WACC',
    bear: 'bear',
    base: 'base',
    bull: 'bull',
    relative: 'Relative valuation',
    owner_earnings: 'Owner Earnings',
    unit: 'B',
  },
  ja: {
    header: '[バリュエーション分析]',
    intrinsic: '内在価値推定',
    market_cap: '現在の時価総額',
    margin: '安全マージン',
    signal: 'バリュエーションシグナル',
    undervalued: '割安',
    overvalued: '割高',
    fair: '適正',
    dcf_wacc: 'DCF (WACC',
    bear: '悲観',
    base: '基準',
    bull: '楽観',
    relative: '相対バリュエーション',
    owner_earnings: 'オーナー利益',
    unit: '億',
  },
};
