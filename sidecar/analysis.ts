import type { StockNews, FullAnalysisResponse } from '../shared/types';
import { scrapeStockNews } from './scraper';
import { fetchStockInfo } from './stock-info';
import { parseSymbol } from './strategies/exchange';
import { AIAnalysisResult } from './ai';
import { createProvider } from './providers/registry';

/**
 * 执行完整的股票分析流程
 * stockInfo 与 news 并行抓取；stockInfo 失败不影响主流程
 */
export async function performFullAnalysis(
  symbol: string,
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean } = {}
): Promise<FullAnalysisResponse> {

  const parsed = parseSymbol(symbol);

  // 并行执行 stockInfo 抓取与新闻抓取
  const [stockInfoResult, newsResult] = await Promise.allSettled([
    fetchStockInfo(parsed),
    scrapeStockNews(symbol, config.deepMode ?? true),
  ]);

  const stockInfo = stockInfoResult.status === 'fulfilled' ? (stockInfoResult.value ?? undefined) : undefined;
  const news: StockNews[] = newsResult.status === 'fulfilled' ? newsResult.value : [];

  if (!news || news.length === 0) {
    throw new Error(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  const provider = createProvider(providerType, config);
  const analysis: AIAnalysisResult = await provider.analyze(symbol, news);

  return { symbol, stockInfo, news, analysis };
}
