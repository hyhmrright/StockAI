import type { StockNews, QuantBundle, Language } from '../shared/types';
import { QUANT_LABELS, VALUATION_LABELS, type QuantLabels } from './prompt-labels';

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

// ── #14 自然语言选股：解析 prompt ───────────────────────────────────────────
// 语言中性英文（避免夹带中文进 en/ja 用户上下文）；仅在末尾注明用户 UI 语言，
// 帮助模型理解可能出现的中/英/日本地化措辞。输出恒为严格 JSON。
const SCREEN_LOCALE_HINT: Record<Language, string> = {
  zh: "The user's input may be written in Chinese.",
  en: "The user's input may be written in English.",
  ja: "The user's input may be written in Japanese.",
};

/**
 * 构建 NL 选股解析 system prompt。要求 LLM 把自然语言选股需求转成严格 ScreenQuery JSON。
 * 枚举全部字段+单位、op、board 映射、分类语义映射规则，并给 few-shot（含空条件例）。
 */
export function buildScreenPrompt(language: Language = 'zh'): string {
  return `You convert a natural-language A-share (China mainland) stock-screening request into a STRICT JSON object. Output ONLY the JSON object, no Markdown fences, no commentary.

The universe is ALL China A-shares (Shanghai + Shenzhen + STAR + ChiNext + Beijing). You do NOT support US stocks, Hong Kong stocks, industry/sector-name filtering, or any non-numeric criteria. Silently ignore any dimension you cannot map to the fields below — never invent a condition.

Output schema:
{
  "conditions": [ { "field": <field>, "op": <op>, "value": <number> } ],
  "board": <board>,            // optional, default "all"
  "limit": <integer 1-100>,    // optional, default 30
  "sortBy": { "field": <field>, "order": "asc" | "desc" }  // optional
}

Fields and units (use EXACTLY these field names):
- price          : latest price, in CNY yuan
- changePercent  : daily change, percent (e.g. 5 means +5%)
- pe             : dynamic price-to-earnings ratio
- pb             : price-to-book ratio
- marketCap      : total market cap, in CNY YUAN (NOT 亿/100M). "100亿"/"10 billion" => 10000000000 ; "500亿" => 50000000000
- turnoverRate   : turnover rate, percent
- roe            : return on equity, percent
- netMargin      : net profit margin, percent
- grossMargin    : gross profit margin, percent
- debtToAsset    : debt-to-asset ratio, percent
- currentRatio   : current ratio, a multiple (x)
- revenueGrowth  : revenue YoY growth, percent
- netIncomeGrowth: net income YoY growth, percent
- compositeScore : overall quant score, 0-100

Operators (op): "gt" (>), "gte" (>=), "lt" (<), "lte" (<=), "eq" (=).

Board mapping:
- "沪深主板" / "main board" => "main"
- "科创板" / "STAR" => "star"
- "创业板" / "ChiNext" => "chinext"
- "北交所" / "Beijing" => "bj"
- unspecified / "全部" => "all"

Classification-semantics mapping (turn vague words into numeric thresholds):
- "看涨" / "优质" / "quality" / "bullish" => { "field": "compositeScore", "op": "gte", "value": 60 }
- "低估" / "undervalued" => prefer pe/pb thresholds, or omit if unclear.
- Any dimension you cannot express with the fields above => ignore it.
- If NONE of the request maps to a valid condition, return { "conditions": [] }.

Examples:
Input: "ROE大于15%且市盈率小于20的沪深主板股票"
Output: {"conditions":[{"field":"roe","op":"gt","value":15},{"field":"pe","op":"lt","value":20}],"board":"main"}

Input: "市值大于500亿、换手率低于5%的优质创业板股票，按综合分排序取前10"
Output: {"conditions":[{"field":"marketCap","op":"gt","value":50000000000},{"field":"turnoverRate","op":"lt","value":5},{"field":"compositeScore","op":"gte","value":60}],"board":"chinext","limit":10,"sortBy":{"field":"compositeScore","order":"desc"}}

Input: "今天天气怎么样"
Output: {"conditions":[]}

${SCREEN_LOCALE_HINT[language]}`;
}
