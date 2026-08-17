import type {
  AIAnalysisResult,
  FullAnalysisResponse,
  MarketBundle,
  StockInfo,
  StockNews,
  QuantBundle,
  Language,
} from '../shared/types';
import type { ParsedSymbol } from './parsers/exchange';
import type { AIProvider } from './ai';
import { scrapeStockNews as realScrape } from './scraper';
import { fetchStockInfo as realFetchInfo } from './stock-info';
import { parseSymbol } from './parsers/exchange';
import { needsNameLookup, enhanceSymbol } from './symbol';
import { createProvider as realCreateProvider } from './providers/registry';
import { toErrorMessage } from './utils';
import { logger } from './log';
import { ScrapeEmptyError } from './errors';

/** 中性评分基准 */
const NEUTRAL_RATING = 50;

/**
 * 等公司名的上限。
 *
 * 公司名只用来把搜索词从 "601012" 变成 "隆基绿能601012"，是**搜索优化而非强依赖**，
 * 不该让一次慢查询把新闻抓取整体顶后：实测 hq.sinajs.cn 抖动 0.29s–8.00s，打满超时
 * 那次整个 bundle 从 5.71s 涨到 15.92s，多出来的全是干等。3s 能保住实测的正常区间
 * （0.29s / 2.28s），只砍掉长尾。
 *
 * 超时只是**不再等**——信息本身仍在后台跑完并进入 bundle，不会因此丢字段。
 */
const NAME_WAIT_MS = 3_000;

/** 测试注入点；生产不传。避开 bun:test 全局 mock.module 导致的跨文件状态泄漏。 */
export interface AnalysisDeps {
  scrape?: typeof realScrape;
  fetchInfo?: (parsed: ParsedSymbol) => Promise<StockInfo | null>;
  createProvider?: (
    type: string,
    cfg: { apiKey?: string; baseUrl?: string; model?: string },
  ) => AIProvider;
  /** 覆盖等公司名的上限，仅为让超时用例秒级跑完；生产走 NAME_WAIT_MS */
  nameWaitMs?: number;
}

function resolveDeps(deps: AnalysisDeps): Required<AnalysisDeps> {
  return {
    scrape: deps.scrape ?? realScrape,
    fetchInfo: deps.fetchInfo ?? realFetchInfo,
    createProvider: deps.createProvider ?? realCreateProvider,
    nameWaitMs: deps.nameWaitMs ?? NAME_WAIT_MS,
  };
}

/**
 * 最多等 promise 这么久；超时或失败一律给 null——调用方据此走降级分支。
 * 刻意**不取消**原 promise：它仍会跑完，结果照常进入 bundle。
 */
function waitAtMost<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms).unref?.()),
  ]).catch(() => null);
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

  // 股票信息**只取一次**，两个用途共用：拼新闻搜索词、以及作为 bundle 的一部分返回。
  // 此前搜索词增强自己又拉了一遍同一接口，同一份数据串行请求两遍；实测 A 股每次 bundle
  // 发出 2 个 hq.sinajs.cn 请求（美股 1 个），而该源抖动区间 0.26s–8.00s，多出的那次
  // 往返最坏白等 8 秒，还串在整条链最前面把新闻抓取一起顶后。
  const infoPromise = resolved.fetchInfo(parsed).catch(() => null);

  // A 股纯代码要等公司名回来才能拼搜索词；其余市场无此依赖，信息与新闻保持并发。
  // 等待有上限（见 NAME_WAIT_MS）：名字没按时到就用裸代码去搜——实测裸代码在东财与
  // Google RSS 上都能拿到 8/8 条相关新闻，远好过为一个搜索词优化把整条链干等到 8 秒。
  const searchSymbol = needsNameLookup(parsed)
    ? enhanceSymbol(symbol, parsed, await waitAtMost(infoPromise, resolved.nameWaitMs))
    : symbol;

  const [stockInfo, news] = await Promise.all([
    infoPromise.then((info) => info ?? undefined),
    resolved.scrape(searchSymbol, deepMode).catch(() => [] as StockNews[]),
  ]);

  if (news.length === 0) {
    throw new ScrapeEmptyError(
      `未搜寻到股票 "${symbol}" 的相关近期新闻。对于 A 股，请确保输入了 6 位代码（如 601012）；对于美股，请使用大写代码（如 AAPL）。`,
    );
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
      zh: {
        summary: `AI 分析服务暂不可用（可能未配置 API Key 或网络异常）。真实新闻数据已抓取，请参考上方列表。\n详细错误: ${msg}`,
        pro: '新闻抓取成功',
        con: 'AI 分析失败',
      },
      en: {
        summary: `AI analysis unavailable (API key may be missing or network error). News data was fetched — see the list above.\nError: ${msg}`,
        pro: 'News fetched successfully',
        con: 'AI analysis failed',
      },
      ja: {
        summary: `AI分析サービスが利用できません（APIキーが未設定またはネットワークエラーの可能性）。ニュースデータは取得済みです。\nエラー: ${msg}`,
        pro: 'ニュース取得成功',
        con: 'AI分析失敗',
      },
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
  config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    deepMode?: boolean;
    language?: Language;
  } = {},
  deps: AnalysisDeps = {},
): Promise<FullAnalysisResponse> {
  const bundle = await fetchMarketBundle(symbol, config.deepMode ?? true, deps);
  const analysis = await analyzeNewsWithLLM(
    symbol,
    bundle.news,
    providerType,
    config,
    undefined,
    deps,
  );
  return { symbol, stockInfo: bundle.stockInfo, news: bundle.news, analysis };
}
