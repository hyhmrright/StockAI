import type { StockNews } from '../shared/types';
import { scrapeStockNews } from './scraper';
import { AIAnalysisResult } from './ai';
import { createProvider } from './providers/registry';

/**
 * 执行完整的股票分析流程
 * @param symbol 股票代码
 * @param providerType AI 提供者类型 ('openai' | 'ollama')
 * @param config 配置项 (apiKey, baseUrl 等)
 */
export async function performFullAnalysis(
  symbol: string,
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean } = {}
): Promise<{ symbol: string; news: StockNews[]; analysis: AIAnalysisResult }> {

  // 1. 抓取新闻（deepMode 控制是否提取全文正文）
  const news = await scrapeStockNews(symbol, config.deepMode ?? true);

  if (!news || news.length === 0) {
    throw new Error(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  // 2. 通过工厂创建 AI Provider
  const provider = createProvider(providerType, config);

  // 3. 执行 AI 分析
  const analysis = await provider.analyze(symbol, news);

  return { symbol, news, analysis };
}
