import type { AIAnalysisResult, FullAnalysisResponse, MarketBundle, StockInfo, StockNews, QuantBundle, Language } from '../shared/types';
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

/** 未抓到新闻时抛出，供 cli-handlers 识别并映射到 ERR_SCRAPE_EMPTY 错误码 */
export class ScrapeEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapeEmptyError';
  }
}

/** 测试注入点；生产不传。避开 bun:test 全局 mock.module 导致的跨文件状态泄漏。 */
export interface AnalysisDeps {
  scrape?: typeof realScrape;
  fetchInfo?: (parsed: ParsedSymbol) => Promise<StockInfo | null>;
  enhance?: typeof realEnhance;
  createProvider?: (type: string, cfg: { apiKey?: string; baseUrl?: string; model?: string }) => AIProvider;
}

function resolveDeps(deps: AnalysisDeps): Required<AnalysisDeps> {
  return {
    scrape:         deps.scrape         ?? realScrape,
    fetchInfo:      deps.fetchInfo      ?? realFetchInfo,
    enhance:        deps.enhance        ?? realEnhance,
    createProvider: deps.createProvider ?? realCreateProvider,
  };
}

/**
 * 仅抓取数据（信息 + 新闻），不调 LLM。
 * news 为空时抛 ScrapeEmptyError，让前端在用户点 "AI 分析" 前就能识别"无数据"。
 */
export async function fetchMarketBundle(
  symbol: string,
  deepMode: boolean = true,
  deps: AnalysisDeps = {},
): Promise<MarketBundle> {
  const resolved = resolveDeps(deps);
  const parsed = parseSymbol(symbol);

  // 异步增强搜索词（例如：'601012' -> '隆基绿能601012'）
  const searchSymbol = await resolved.enhance(symbol);

  const [stockInfoResult, newsResult] = await Promise.allSettled([
    resolved.fetchInfo(parsed),
    resolved.scrape(searchSymbol, deepMode),
  ]);

  const stockInfo = stockInfoResult.status === 'fulfilled' ? (stockInfoResult.value ?? undefined) : undefined;
  const news = newsResult.status === 'fulfilled' ? newsResult.value : [];

  if (news.length === 0) {
    throw new ScrapeEmptyError(`未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`);
  }

  return { symbol, stockInfo, news };
}

/**
 * 仅调 LLM 分析已抓到的新闻；失败时返回降级结果而非抛出
 */
export async function analyzeNewsWithLLM(
  symbol: string,
  news: StockNews[],
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string; language?: Language } = {},
  quant?: QuantBundle,
  deps: AnalysisDeps = {},
): Promise<AIAnalysisResult> {
  const createProvider = deps.createProvider ?? realCreateProvider;
  try {
    const provider = createProvider(providerType, config);
    return await provider.analyze(symbol, news, quant, config.language);
  } catch (error) {
    const msg = toErrorMessage(error);
    logger.error(`AI 分析异常 (${symbol}): ${msg}`);
    const lang = config.language ?? 'zh';
    const FALLBACK: Record<string, { summary: string; pro: string; con: string }> = {
      zh: { summary: `AI 分析服务暂不可用（可能未配置 API Key 或网络异常）。真实新闻数据已抓取，请参考上方列表。\n详细错误: ${msg}`, pro: '新闻抓取成功', con: 'AI 分析失败' },
      en: { summary: `AI analysis unavailable (API key may be missing or network error). News data was fetched — see the list above.\nError: ${msg}`, pro: 'News fetched successfully', con: 'AI analysis failed' },
      ja: { summary: `AI分析サービスが利用できません（APIキーが未設定またはネットワークエラーの可能性）。ニュースデータは取得済みです。\nエラー: ${msg}`, pro: 'ニュース取得成功', con: 'AI分析失敗' },
    };
    const fb = FALLBACK[lang] ?? FALLBACK.zh;
    return {
      rating: NEUTRAL_RATING,
      sentiment: 'neutral',
      summary: fb.summary,
      pros: [fb.pro],
      cons: [fb.con],
    };
  }
}

/**
 * 完整流水线：抓取 + LLM 分析（保留向后兼容；新交互流程不再走此函数）
 */
export async function performFullAnalysis(
  symbol: string,
  providerType: string = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean; language?: Language } = {},
  deps: AnalysisDeps = {},
): Promise<FullAnalysisResponse> {
  const bundle = await fetchMarketBundle(symbol, config.deepMode ?? true, deps);
  const analysis = await analyzeNewsWithLLM(symbol, bundle.news, providerType, config, undefined, deps);
  return { symbol, stockInfo: bundle.stockInfo, news: bundle.news, analysis };
}
