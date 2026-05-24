import type { StockNews, QuantBundle } from '../shared/types';

/**
 * 所有 Provider 共用的 system prompt——JSON 纯文本格式要求对 OpenAI / Anthropic / Ollama 都适用。
 */
export const SYSTEM_PROMPT =
  "你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。" +
  "请始终以纯 JSON 文本格式回复（不包含 Markdown 代码块标记或任何额外说明）。";

/**
 * AI 分析的角色指令
 */
const ROLE_INSTRUCTIONS = `请作为资深金融分析师，深入分析该股票的近期表现。
你会收到一组抓取到的最新新闻及正文摘要，请根据这些信息进行客观、深度的研判。`;

/**
 * 期望的 JSON 响应格式约束
 */
const FORMAT_INSTRUCTIONS = `必须返回以下 JSON 格式，且不包含 Markdown 代码块标记（直接输出 JSON 文本）：
{
  "rating": 1-100 的评分数字 (例如 85),
  "sentiment": "bullish" (看涨), "bearish" (看跌) 或 "neutral" (中性),
  "summary": "分析摘要，请包含新闻中提到的关键事实",
  "pros": ["利多理由"],
  "cons": ["风险提示"],
  "sector": "该股票所属的大板块（例如：信息技术、消费品、工业等）",
  "industry": "具体行业分类（例如：半导体、新能源、白酒等）",
  "description": "基于你的训练知识和新闻，用一句话简要描述该公司的主营业务和市场地位"
}`;

/**
 * 构建股票分析 Prompt
 * @param symbol 股票代码
 * @param news 新闻列表
 * @param contentLimit 正文摘要截断字符数
 */
export function buildAnalysisPrompt(
  symbol: string,
  news: StockNews[],
  contentLimit = 1000
): string {
  const newsList = news.map((n, i) => {
    let item = `${i + 1}. 【标题】: ${n.title}`;
    if (n.source) item += ` (来源: ${n.source})`;
    if (n.content && n.content.length > 50) {
      item += `\n   【正文摘要】: ${n.content.substring(0, contentLimit)}`;
    }
    return item;
  }).join("\n\n");

  return `${ROLE_INSTRUCTIONS}

股票代码: ${symbol}

抓取新闻列表:
${newsList}

请结合以上信息（特别是新闻正文中的细节）提供一个结构化的分析报告。

${FORMAT_INSTRUCTIONS}`;
}

function translateSignal(signal: string): string {
  switch (signal) {
    case 'bullish': return '看涨';
    case 'bearish': return '看跌';
    default: return '中性';
  }
}

function formatQuantSummary(quant: QuantBundle): string {
  const t = quant.technical;
  const f = quant.fundamental;
  const td = t.details;
  const fd = f.details;

  const lines: string[] = [
    '[量化分析摘要]',
    '',
    `技术面信号：${translateSignal(t.signal)}，置信度 ${t.confidence}%`,
  ];

  if (td.alignment != null) lines.push(`- EMA 排列：${td.alignment === 'bullish' ? '多头排列' : td.alignment === 'bearish' ? '空头排列' : '交叉纠缠'}`);
  if (td.rsi != null) lines.push(`- RSI(14)：${td.rsi}${Number(td.rsi) < 30 ? '（超卖）' : Number(td.rsi) > 70 ? '（超买）' : '（中性区间）'}`);
  if (td.macd_trend != null) lines.push(`- MACD：柱状量${td.macd_trend === 'expanding' ? '放大' : '收缩'}`);
  if (td.adx != null) lines.push(`- ADX：${td.adx}${Number(td.adx) > 25 ? '（趋势明确）' : '（趋势较弱）'}`);
  if (td.volume_ratio != null) lines.push(`- 成交量比：${td.volume_ratio}（相对20日均量）`);

  lines.push('');
  lines.push(`基本面信号：${translateSignal(f.signal)}，置信度 ${f.confidence}%`);

  if (fd.roe != null) lines.push(`- ROE: ${fd.roe}%`);
  if (fd.net_margin != null) lines.push(`- 净利率: ${fd.net_margin}%`);
  if (fd.revenue_growth != null) lines.push(`- 营收增长: ${fd.revenue_growth}%`);
  if (fd.pe != null) lines.push(`- PE: ${fd.pe}`);
  if (fd.pb != null) lines.push(`- PB: ${fd.pb}`);
  if (fd.debt_to_asset != null) lines.push(`- 资产负债率: ${fd.debt_to_asset}%`);

  lines.push('');
  lines.push(`综合量化评分：${quant.composite.score}/100（${translateSignal(quant.composite.signal)}）`);

  return lines.join('\n');
}

function formatValuationSummary(quant: QuantBundle): string | null {
  const v = quant.valuation;
  if (!v) return null;

  const lines: string[] = ['[估值分析]', ''];
  if (v.intrinsicValue != null) {
    lines.push(`内在价值估算: ${(v.intrinsicValue / 1e8).toFixed(0)}亿`);
  }
  if (v.marketCap != null) {
    lines.push(`当前市值: ${(v.marketCap / 1e8).toFixed(0)}亿`);
  }
  if (v.marginOfSafety != null) {
    const pct = (v.marginOfSafety * 100).toFixed(1);
    lines.push(`安全边际: ${v.marginOfSafety > 0 ? '+' : ''}${pct}%`);
  }
  lines.push(`估值信号: ${v.signal === 'undervalued' ? '低估' : v.signal === 'overvalued' ? '高估' : '合理'}`);

  if (v.models.ownerEarnings) lines.push(`- Owner Earnings: ${v.models.ownerEarnings.details}`);
  if (v.models.dcf) {
    lines.push(`- DCF (WACC ${(v.models.dcf.wacc * 100).toFixed(1)}%): 悲观 ${(v.models.dcf.bear / 1e8).toFixed(0)}亿 / 基准 ${(v.models.dcf.base / 1e8).toFixed(0)}亿 / 乐观 ${(v.models.dcf.bull / 1e8).toFixed(0)}亿`);
  }
  if (v.models.relative) lines.push(`- 相对估值: ${v.models.relative.details}`);

  return lines.join('\n');
}

export function buildEnhancedPrompt(
  symbol: string,
  news: StockNews[],
  quant: QuantBundle,
  contentLimit = 1000,
): string {
  const quantSection = formatQuantSummary(quant);
  const valuationSection = formatValuationSummary(quant);
  const newsPrompt = buildAnalysisPrompt(symbol, news, contentLimit);

  const sections = [quantSection];
  if (valuationSection) sections.push(valuationSection);
  sections.push(newsPrompt);

  return `${sections.join('\n\n')}

请结合量化分析数据和新闻信息，给出综合研判。在 JSON 中额外增加两个字段：
"technicalView": "对技术面指标的文字解读（1-2 句话）",
"fundamentalView": "对基本面指标的文字解读（1-2 句话）"`;
}
