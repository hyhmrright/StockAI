import type { StockNews, FullAnalysisResponse } from '../shared/types';
import { scrapeStockNews } from './scraper';
import { fetchStockInfo } from './stock-info';
import { parseSymbol } from './strategies/exchange';
import { AIAnalysisResult } from './ai';
import { createProvider } from './providers/registry';
import { toErrorMessage, logger } from './utils';

/**
 * 并行抓取股票基本信息和新闻。
 * 对于纯代码输入的 A 股（无中文名），先从 Sina 获取公司名，再用"名称+代码"搜索新闻，
 * 提升中文新闻的命中率（中文财经新闻通常用公司名而非数字代码）。
 */
async function fetchMarketData(
  symbol: string,
  deepMode: boolean
): Promise<{ stockInfo: FullAnalysisResponse['stockInfo']; news: StockNews[] }> {
  const parsed = parseSymbol(symbol);

  // A 股纯代码输入：先获取公司名再搜索，用名称替代数字代码提升新闻命中率
  if (parsed.chinaInfo && !parsed.displayName) {
    const stockInfo = await fetchStockInfo(parsed).catch(() => null);
    const searchSymbol = stockInfo?.name
      ? `${stockInfo.name}${parsed.chinaInfo!.code}`
      : symbol;

    const news = await scrapeStockNews(searchSymbol, deepMode).catch(() => [] as StockNews[]);
    return {
      stockInfo: stockInfo ?? undefined,
      news,
    };
  }

  const [stockInfoResult, newsResult] = await Promise.allSettled([
    fetchStockInfo(parsed),
    scrapeStockNews(symbol, deepMode),
  ]);

  return {
    // fetchStockInfo 返回 null 表示未找到；此处统一转为 undefined 匹配 FullAnalysisResponse 的可选字段类型
    stockInfo: stockInfoResult.status === 'fulfilled' ? (stockInfoResult.value ?? undefined) : undefined,
    news: newsResult.status === 'fulfilled' ? newsResult.value : [],
  };
}

/**
 * 调用 AI Provider 进行分析；失败时返回降级结果而非抛出
 */
async function analyzeWithAI(
  symbol: string,
  news: StockNews[],
  providerType: string,
  config: { apiKey?: string; baseUrl?: string; model?: string }
): Promise<AIAnalysisResult> {
  try {
    const provider = createProvider(providerType, config);
    return await provider.analyze(symbol, news);
  } catch (error) {
    const msg = toErrorMessage(error);
    logger.error(`AI 分析异常 (${symbol}): ${msg}`);
    return {
      rating: 50,
      sentiment: 'neutral',
      summary: `AI 分析服务暂不可用（可能未配置 API Key 或网络异常）。真实新闻数据已抓取，请参考上方列表。\n详细错误: ${msg}`,
      pros: ["新闻抓取成功"],
      cons: ["AI 分析失败"],
    };
  }
}

/**
 * 执行完整的股票分析流程
 */
export async function performFullAnalysis(
  symbol: string,
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean } = {}
): Promise<FullAnalysisResponse> {
  const { stockInfo, news } = await fetchMarketData(symbol, config.deepMode ?? true);

  if (news.length === 0) {
    throw new Error(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  const analysis = await analyzeWithAI(symbol, news, providerType, config);

  return { symbol, stockInfo, news, analysis };
}
