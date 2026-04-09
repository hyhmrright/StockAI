import type { StockNews } from '../shared/types';

/**
 * 构建股票分析 Prompt（所有 AI Provider 共用）
 * @param symbol 股票代码
 * @param news 新闻列表
 * @param contentLimit 正文摘要截断字符数（不同 Provider 可按 token 限制调整）
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

  return `请作为资深金融分析师，深入分析股票 ${symbol} 的近期表现。
以下是关于该股票的最新抓取新闻及部分正文：

${newsList}

请结合以上信息（特别是新闻正文中的细节）提供一个结构化的分析报告。返回以下 JSON 格式：
{
  "rating": 1-100 的评分数字 (例如 85),
  "sentiment": "bullish" (看涨), "bearish" (看跌) 或 "neutral" (中性),
  "summary": "分析摘要，请包含新闻中提到的关键事实",
  "pros": ["利多理由"],
  "cons": ["风险提示"]
}

必须确保返回的是合法的 JSON 字符串，不包含 Markdown 代码块标记。`;
}
