import type { StockNews } from '../shared/types';

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
  "cons": ["风险提示"]
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
