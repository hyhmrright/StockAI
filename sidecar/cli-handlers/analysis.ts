import {
  toErrorMessage,
  outputJson,
  logger,
  successEnvelope,
  errorEnvelope,
  errorEnvelopeFromUnknown,
} from '../utils';
import { ScrapeEmptyError } from '../analysis';
import type { ResolvedConfig } from '../configResolver';
import type { StockNews, QuantBundle, MasterWeightInput } from '../../shared/types';
import type { HandlerContext } from './context';

/**
 * 解析可选的 quant JSON。三态返回：有值 / undefined（未传，调用方自行补拉）/
 * false（格式非法，错误信封已写出，调用方必须直接 return）。
 */
function tryParseQuant(
  quantJson: string | undefined,
  out: typeof outputJson,
): QuantBundle | undefined | false {
  if (!quantJson) return undefined;
  try {
    return JSON.parse(quantJson);
  } catch {
    out(errorEnvelope('ERR_INVALID_PARAM', 'quantJson 格式无效'));
    return false;
  }
}

/**
 * 解析大师权重摘要（best-effort）：解析失败/非数组一律静默降级为空数组，
 * 绝不因权重解析失败而让整个深度分析报错——权重只是聚合层微调，缺省即默认权重。
 */
function parseWeights(weightsJson: string | undefined): MasterWeightInput[] {
  if (!weightsJson) return [];
  try {
    const parsed = JSON.parse(weightsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn(`大师权重解析失败，退化为默认权重: ${toErrorMessage(err)}`);
    return [];
  }
}

/** LLM 分析链路：抓取(bundle) → 基础分析 → 深度分析（多大师）。 */
export function createAnalysisHandlers({ out, deps }: HandlerContext) {
  return {
    /**
     * 执行完整分析 - 此处才会触发 playwright 相关的 scraper 加载
     * （保留向后兼容；新交互流程走 handleFetchBundle + handleAnalyzeOnly）
     */
    async handleAnalysis(symbol: string, config: ResolvedConfig) {
      try {
        const analyze = deps._analyze ?? (await import('../analysis')).performFullAnalysis;
        const result = await analyze(symbol, config.provider, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelName,
          deepMode: config.deepMode,
          language: config.language,
        });
        out(successEnvelope(result));
      } catch (error) {
        const code = error instanceof ScrapeEmptyError ? 'ERR_SCRAPE_EMPTY' : 'ERR_ANALYSIS_FAILED';
        out(errorEnvelope(code, toErrorMessage(error)));
      }
    },

    /**
     * 仅抓数据（StockInfo + News）不调 LLM — 新交互流程第一步
     */
    async handleFetchBundle(symbol: string, config: ResolvedConfig) {
      try {
        const fetchBundle = deps._fetchBundle ?? (await import('../analysis')).fetchMarketBundle;
        const bundle = await fetchBundle(symbol, config.deepMode);
        out(successEnvelope(bundle));
      } catch (error) {
        const code = error instanceof ScrapeEmptyError ? 'ERR_SCRAPE_EMPTY' : 'ERR_BUNDLE_FAILED';
        out(errorEnvelope(code, toErrorMessage(error)));
      }
    },

    /**
     * 仅调 LLM 分析已抓到的新闻 — 新交互流程第二步
     * news 由前端从 bundle 缓存传回，避免在 sidecar 重复抓取
     */
    async handleAnalyzeOnly(
      symbol: string,
      news: StockNews[],
      config: ResolvedConfig,
      quantJson?: string,
    ) {
      try {
        if (!Array.isArray(news) || news.length === 0) {
          out(errorEnvelope('ERR_MISSING_PARAM', '未提供有效的 news 数组，请先拉取新闻'));
          return;
        }
        const quant = tryParseQuant(quantJson, out);
        if (quant === false) return;
        const analyzeOnly = deps._analyzeOnly ?? (await import('../analysis')).analyzeNewsWithLLM;
        const analysis = await analyzeOnly(
          symbol,
          news,
          config.provider,
          {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.modelName,
            language: config.language,
          },
          quant,
        );
        out(successEnvelope(analysis));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_ANALYSIS_FAILED', error));
      }
    },

    async handleDeepAnalysis(
      symbol: string,
      news: StockNews[],
      config: ResolvedConfig,
      quantJson?: string,
      weightsJson?: string,
    ) {
      try {
        if (!Array.isArray(news) || news.length === 0) {
          out(errorEnvelope('ERR_MISSING_PARAM', '深度分析需要 news 数据'));
          return;
        }
        let quant = tryParseQuant(quantJson, out);
        if (quant === false) return;
        if (!quant) {
          const { fetchQuantBundle } = await import('../quant');
          quant = await fetchQuantBundle(symbol);
        }
        const { createChatProvider } = await import('../agents/chat-adapter');
        const { runDeepAnalysis, concurrencyForProvider } = await import('../deep-analysis');
        const { brain, quick } = config.roles;
        // 大师 + 综合走 brain；情绪逐条标注走 quick（可指向更便宜的模型）
        const chat = createChatProvider(brain);
        const sentimentChat = createChatProvider(quick);
        const result = await runDeepAnalysis({
          symbol,
          quant,
          news,
          chat,
          sentimentChat,
          selectedMasters: config.selectedMasters,
          language: config.language,
          // 大师跑在 brain provider 上，按其决定并发上限
          concurrency: concurrencyForProvider(brain.provider),
          // 缓存指纹含 brain+quick 两者：任一角色换模型即 miss，避免复用旧 sentiment/大师结果
          cacheFingerprint: `${brain.provider}:${brain.model}|${quick.provider}:${quick.model}`,
          // 大师历史命中率摘要（前端算好经参数注入）；解析失败已在 parseWeights 静默降级
          masterWeights: parseWeights(weightsJson),
        });
        out(successEnvelope(result));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_DEEP_ANALYSIS', error));
      }
    },
  };
}
