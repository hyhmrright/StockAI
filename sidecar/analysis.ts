import type { AIAnalysisResult, FullAnalysisResponse, StockInfo, StockNews } from '../shared/types';
import type { ParsedSymbol } from './parsers/exchange';
import type { AIProvider } from './ai';
import { scrapeStockNews as realScrape } from './scraper';
import { fetchStockInfo as realFetchInfo } from './stock-info';
import { parseSymbol } from './parsers/exchange';
import { getEnhancedSymbol as realEnhance } from './symbol';
import { createProvider as realCreateProvider } from './providers/registry';
import { toErrorMessage, logger } from './utils';

/** 中性评分基准 */
const NEUTRAL_RATING = 50;

/** 测试注入点；生产不传。避开 bun:test 全局 mock.module 导致的跨文件状态泄漏。 */
export interface AnalysisDeps {
  scrape?: typeof realScrape;
  fetchInfo?: (parsed: ParsedSymbol) => Promise<StockInfo | null>;
  enhance?: typeof realEnhance;
  createProvider?: (type: string, cfg: { apiKey?: string; baseUrl?: string; model?: string }) => AIProvider;
}

/**
 * 并行抓取股票基本信息和新闻。
 */
async function fetchMarketData(
  symbol: string,
  deepMode: boolean,
  deps: Required<AnalysisDeps>,
): Promise<{ stockInfo: FullAnalysisResponse['stockInfo']; news: StockNews[] }> {
  const parsed = parseSymbol(symbol);

  // 异步增强搜索词（例如：'601012' -> '隆基绿能601012'）
  const searchSymbol = await deps.enhance(symbol);

  const [stockInfoResult, newsResult] = await Promise.allSettled([
    deps.fetchInfo(parsed),
    deps.scrape(searchSymbol, deepMode),
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
  config: { apiKey?: string; baseUrl?: string; model?: string },
  createProvider: Required<AnalysisDeps>['createProvider'],
): Promise<AIAnalysisResult> {
  try {
    const provider = createProvider(providerType, config);
    return await provider.analyze(symbol, news);
  } catch (error) {
    const msg = toErrorMessage(error);
    logger.error(`AI 分析异常 (${symbol}): ${msg}`);
    return {
      rating: NEUTRAL_RATING,
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
  config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean } = {},
  deps: AnalysisDeps = {},
): Promise<FullAnalysisResponse> {
  const resolved: Required<AnalysisDeps> = {
    scrape:         deps.scrape         ?? realScrape,
    fetchInfo:      deps.fetchInfo      ?? realFetchInfo,
    enhance:        deps.enhance        ?? realEnhance,
    createProvider: deps.createProvider ?? realCreateProvider,
  };

  const { stockInfo, news } = await fetchMarketData(symbol, config.deepMode ?? true, resolved);

  if (news.length === 0) {
    throw new Error(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  const analysis = await analyzeWithAI(symbol, news, providerType, config, resolved.createProvider);

  return { symbol, stockInfo, news, analysis };
}
