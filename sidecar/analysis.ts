import type { StockNews, FullAnalysisResponse } from '../shared/types';
import { scrapeStockNews } from './scraper';
import { fetchStockInfo } from './stock-info';
import { parseSymbol } from './strategies/exchange';
import { AIAnalysisResult } from './ai';
import { createProvider } from './providers/registry';
import { logger } from './utils';

/**
 * 并行抓取股票基本信息和新闻
 * stockInfo 失败不影响主流程，返回 undefined
 */
async function fetchMarketData(
  symbol: string,
  deepMode: boolean
): Promise<{ stockInfo: FullAnalysisResponse['stockInfo']; news: StockNews[] }> {
  const parsed = parseSymbol(symbol);

  const [stockInfoResult, newsResult] = await Promise.allSettled([
    fetchStockInfo(parsed),
    scrapeStockNews(symbol, deepMode),
  ]);

  return {
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
    logger.error(`AI 分析异常 (${symbol}): ${error instanceof Error ? error.message : String(error)}`);
    return {
      rating: 50,
      sentiment: 'neutral',
      summary: `AI 分析服务暂不可用（可能未配置 API Key 或网络异常）。真实新闻数据已抓取，请参考上方列表。\n详细错误: ${error instanceof Error ? error.message : String(error)}`,
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

  if (!news || news.length === 0) {
    throw new Error(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  const analysis = await analyzeWithAI(symbol, news, providerType, config);

  return { symbol, stockInfo, news, analysis };
}
