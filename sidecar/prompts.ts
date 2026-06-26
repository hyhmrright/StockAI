import type { StockNews, QuantBundle, Language } from '../shared/types';

const SYSTEM_PROMPTS: Record<Language, string> = {
  zh:
    '你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。' +
    '请始终以纯 JSON 文本格式回复（不包含 Markdown 代码块标记或任何额外说明）。',
  en:
    'You are a professional financial analyst specializing in fundamental analysis of stocks based on news and market dynamics. ' +
    'Always reply in plain JSON text format (no Markdown code fences or extra commentary).',
  ja:
    'あなたはニュースと市場動向に基づいて株式のファンダメンタル分析を専門とするプロの金融アナリストです。' +
    '常に純粋なJSONテキスト形式で返答してください（Markdownコードフェンスや余分なコメントは含めないでください）。',
};

export function getSystemPrompt(language: Language = 'zh'): string {
  return SYSTEM_PROMPTS[language];
}

const ROLE_INSTRUCTIONS: Record<Language, string> = {
  zh: `请作为资深金融分析师，深入分析该股票的近期表现。\n你会收到一组抓取到的最新新闻及正文摘要，请根据这些信息进行客观、深度的研判。`,
  en: `As a senior financial analyst, provide an in-depth analysis of this stock's recent performance.\nYou will receive a set of the latest news articles with content summaries. Provide an objective, thorough assessment based on this information.`,
  ja: `シニア金融アナリストとして、この銘柄の最近のパフォーマンスを詳しく分析してください。\n最新ニュース記事と本文要約のセットを受け取ります。この情報に基づいて客観的で深い評価を提供してください。`,
};

const FORMAT_INSTRUCTIONS: Record<Language, string> = {
  zh: `必須返回以下 JSON 格式，且不包含 Markdown 代码块标记（直接输出 JSON 文本）：
{
  "rating": 1-100 的评分数字 (例如 85),
  "sentiment": "bullish" (看涨), "bearish" (看跌) 或 "neutral" (中性),
  "summary": "分析摘要，请包含新闻中提到的关键事实",
  "pros": ["利多理由"],
  "cons": ["风险提示"],
  "sector": "该股票所属的大板块（例如：信息技术、消费品、工业等）",
  "industry": "具体行业分类（例如：半导体、新能源、白酒等）",
  "description": "基于你的训练知识和新闻，用一句话简要描述该公司的主营业务和市场地位"
}`,
  en: `Return ONLY the following JSON (no Markdown fences):
{
  "rating": numeric score 1-100 (e.g. 85),
  "sentiment": "bullish", "bearish", or "neutral",
  "summary": "Analysis summary — include key facts from the news",
  "pros": ["positive factors"],
  "cons": ["risk factors"],
  "sector": "Broad sector (e.g. Technology, Consumer Goods, Industrials)",
  "industry": "Specific industry (e.g. Semiconductors, Renewable Energy, Beverages)",
  "description": "One sentence describing the company's main business and market position based on your knowledge and the news"
}`,
  ja: `以下のJSONのみを返してください（Markdownフェンスなし）：
{
  "rating": 1-100の数値スコア（例：85）,
  "sentiment": "bullish"、"bearish"、または"neutral",
  "summary": "分析サマリー。ニュースの重要な事実を含めること",
  "pros": ["ポジティブ要因"],
  "cons": ["リスク要因"],
  "sector": "大分類セクター（例：テクノロジー、消費財、工業）",
  "industry": "具体的な業種（例：半導体、再生可能エネルギー、飲料）",
  "description": "ニュースとあなたの知識に基づいて、会社の主要事業と市場地位を一文で説明"
}`,
};

const NEWS_LABELS: Record<
  Language,
  { title: string; source: string; body: string; stock: string; list: string; instruct: string }
> = {
  zh: {
    title: '标题',
    source: '来源',
    body: '正文摘要',
    stock: '股票代码',
    list: '抓取新闻列表',
    instruct: '请结合以上信息（特别是新闻正文中的细节）提供一个结构化的分析报告。',
  },
  en: {
    title: 'Title',
    source: 'Source',
    body: 'Content',
    stock: 'Ticker',
    list: 'News articles',
    instruct:
      'Using the above news (especially the article details), provide a structured analysis report.',
  },
  ja: {
    title: 'タイトル',
    source: 'ソース',
    body: '本文要約',
    stock: '銘柄',
    list: 'ニュース記事',
    instruct:
      '上記ニュース（特に記事の詳細）を使用して、構造化された分析レポートを提供してください。',
  },
};

export function buildAnalysisPrompt(
  symbol: string,
  news: StockNews[],
  language: Language = 'zh',
  contentLimit = 1000,
): string {
  const lbl = NEWS_LABELS[language];
  const newsList = news
    .map((n, i) => {
      let item = `${i + 1}. 【${lbl.title}】: ${n.title}`;
      if (n.source) item += ` (${lbl.source}: ${n.source})`;
      if (n.content && n.content.length > 50) {
        item += `\n   【${lbl.body}】: ${n.content.substring(0, contentLimit)}`;
      }
      return item;
    })
    .join('\n\n');

  return `${ROLE_INSTRUCTIONS[language]}

${lbl.stock}: ${symbol}

${lbl.list}:
${newsList}

${lbl.instruct}

${FORMAT_INSTRUCTIONS[language]}`;
}

// ---- 量化/估值标签 ----

interface QuantLabels {
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

const QUANT_LABELS: Record<Language, QuantLabels> = {
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

const VALUATION_LABELS: Record<Language, ValuationLabels> = {
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

function translateSignal(signal: string, lbl: QuantLabels): string {
  if (signal === 'bullish') return lbl.bullish;
  if (signal === 'bearish') return lbl.bearish;
  return lbl.neutral;
}

function formatQuantSummary(quant: QuantBundle, language: Language): string {
  const lbl = QUANT_LABELS[language];
  const t = quant.technical;
  const f = quant.fundamental;
  const td = t.details;
  const fd = f.details;

  const lines: string[] = [
    lbl.header,
    '',
    `${lbl.technical}：${translateSignal(t.signal, lbl)}，${lbl.confidence} ${t.confidence}%`,
  ];

  if (td.alignment != null)
    lines.push(
      `- ${lbl.ema_align}：${td.alignment === 'bullish' ? lbl.bullish_align : td.alignment === 'bearish' ? lbl.bearish_align : lbl.mixed_align}`,
    );
  if (td.rsi != null)
    lines.push(
      `- ${lbl.rsi}：${td.rsi}${Number(td.rsi) < 30 ? lbl.oversold : Number(td.rsi) > 70 ? lbl.overbought : lbl.neutral_range}`,
    );
  if (td.macd_trend != null)
    lines.push(
      `- ${lbl.macd}：${lbl.macd_hist}${td.macd_trend === 'expanding' ? lbl.macd_expanding : lbl.macd_contracting}`,
    );
  if (td.adx != null)
    lines.push(`- ${lbl.adx}：${td.adx}${Number(td.adx) > 25 ? lbl.adx_strong : lbl.adx_weak}`);
  if (td.volume_ratio != null) lines.push(`- ${lbl.vol}：${td.volume_ratio}${lbl.vol_vs}`);

  lines.push(
    '',
    `${lbl.fundamental}：${translateSignal(f.signal, lbl)}，${lbl.confidence} ${f.confidence}%`,
  );

  if (fd.roe != null) lines.push(`- ROE：${fd.roe}%`);
  if (fd.net_margin != null) lines.push(`- ${lbl.net_margin}：${fd.net_margin}%`);
  if (fd.revenue_growth != null) lines.push(`- ${lbl.revenue_growth}：${fd.revenue_growth}%`);
  if (fd.pe != null) lines.push(`- PE：${fd.pe}`);
  if (fd.pb != null) lines.push(`- PB：${fd.pb}`);
  if (fd.debt_to_asset != null) lines.push(`- ${lbl.debt_to_asset}：${fd.debt_to_asset}%`);

  lines.push(
    '',
    `${lbl.composite}：${quant.composite.score}/100（${translateSignal(quant.composite.signal, lbl)}）`,
  );

  if (quant.risk) {
    const r = quant.risk;
    const riskLabel =
      r.riskLevel === 'low'
        ? lbl.low_risk
        : r.riskLevel === 'high'
          ? lbl.high_risk
          : lbl.medium_risk;
    lines.push('', `${lbl.risk_level}：${riskLabel}`);
    lines.push(`- ${lbl.vol_annual}: ${(r.annualizedVolatility * 100).toFixed(1)}%`);
    lines.push(`- ${lbl.max_dd}: ${(r.maxDrawdown * 100).toFixed(1)}%`);
    lines.push(`- ${lbl.sharpe}: ${r.sharpeProxy}`);
  }

  return lines.join('\n');
}

function formatValuationSummary(quant: QuantBundle, language: Language): string | null {
  const v = quant.valuation;
  if (!v) return null;
  const lbl = VALUATION_LABELS[language];

  const lines: string[] = [lbl.header, ''];
  if (v.intrinsicValue != null)
    lines.push(`${lbl.intrinsic}: ${(v.intrinsicValue / 1e8).toFixed(0)}${lbl.unit}`);
  if (v.marketCap != null)
    lines.push(`${lbl.market_cap}: ${(v.marketCap / 1e8).toFixed(0)}${lbl.unit}`);
  if (v.marginOfSafety != null) {
    const pct = (v.marginOfSafety * 100).toFixed(1);
    lines.push(`${lbl.margin}: ${v.marginOfSafety > 0 ? '+' : ''}${pct}%`);
  }
  const sigLabel =
    v.signal === 'undervalued'
      ? lbl.undervalued
      : v.signal === 'overvalued'
        ? lbl.overvalued
        : lbl.fair;
  lines.push(`${lbl.signal}: ${sigLabel}`);

  if (v.models.ownerEarnings)
    lines.push(`- ${lbl.owner_earnings}: ${v.models.ownerEarnings.details}`);
  if (v.models.dcf) {
    lines.push(
      `- ${lbl.dcf_wacc} ${(v.models.dcf.wacc * 100).toFixed(1)}%): ${lbl.bear} ${(v.models.dcf.bear / 1e8).toFixed(0)}${lbl.unit} / ${lbl.base} ${(v.models.dcf.base / 1e8).toFixed(0)}${lbl.unit} / ${lbl.bull} ${(v.models.dcf.bull / 1e8).toFixed(0)}${lbl.unit}`,
    );
  }
  if (v.models.relative) lines.push(`- ${lbl.relative}: ${v.models.relative.details}`);

  return lines.join('\n');
}

const ENHANCED_SUFFIX: Record<Language, string> = {
  zh: `\n\n请结合量化分析数据和新闻信息，给出综合研判。在 JSON 中额外增加两个字段：\n"technicalView": "对技术面指标的文字解读（1-2 句话）",\n"fundamentalView": "对基本面指标的文字解读（1-2 句话）"`,
  en: `\n\nCombine the quantitative data and news for a comprehensive assessment. Add two extra fields to the JSON:\n"technicalView": "Brief interpretation of technical indicators (1-2 sentences)",\n"fundamentalView": "Brief interpretation of fundamental indicators (1-2 sentences)"`,
  ja: `\n\n量的データとニュースを組み合わせて総合評価を行ってください。JSONに以下の2つのフィールドを追加してください：\n"technicalView": "テクニカル指標の簡潔な解釈（1-2文）",\n"fundamentalView": "ファンダメンタル指標の簡潔な解釈（1-2文）"`,
};

export function buildEnhancedPrompt(
  symbol: string,
  news: StockNews[],
  quant: QuantBundle,
  language: Language = 'zh',
  contentLimit = 1000,
): string {
  const quantSection = formatQuantSummary(quant, language);
  const valuationSection = formatValuationSummary(quant, language);
  const newsPrompt = buildAnalysisPrompt(symbol, news, language, contentLimit);

  const sections = [quantSection];
  if (valuationSection) sections.push(valuationSection);
  sections.push(newsPrompt);

  return `${sections.join('\n\n')}${ENHANCED_SUFFIX[language]}`;
}
