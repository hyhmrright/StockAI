import {
  toErrorMessage,
  outputJson,
  withTimeout,
  logger,
  classifyListModelsError,
  successEnvelope,
  errorEnvelope,
  errorEnvelopeFromUnknown,
} from './utils';
import { STATIC_MODELS, PROVIDER_CAPS, PROVIDER_PROFILES } from '../shared/constants';
import type {
  performFullAnalysis as AnalysisFn,
  fetchMarketBundle as FetchBundleFn,
  analyzeNewsWithLLM as AnalyzeFn,
} from './analysis';
import { ScrapeEmptyError } from './analysis';
import type { ResolvedConfig } from './configResolver';
import type { StockNews, QuantBundle, ChatPayload, ProviderType } from '../shared/types';

/** 某 provider 静态目录的模型 id 列表（动态拉取无端点或返回空时兜底） */
function staticModelValues(provider: ProviderType): string[] {
  return (STATIC_MODELS[provider] ?? []).map(m => m.value);
}

/**
 * 向 OpenAI 兼容 / Anthropic 的列模型端点拉真实模型（10s 超时，鉴权头按 provider 区分）。
 * 返回项为各 provider /models 的原始 model id——不过滤 embedding/vision 等非对话模型，与其它 provider 一致。
 * 抛出的错误交由 classifyListModelsError 归类为稳定错误码。fetchImpl 供测试注入，默认全局 fetch。
 */
export async function fetchProviderModels(provider: ProviderType, baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const caps = PROVIDER_CAPS[provider];
  const url = `${baseUrl.replace(/\/$/, '')}${caps.modelsPath}`;
  const headers: Record<string, string> = caps.authStyle === 'anthropic'
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${apiKey}` };
  const resp = await withTimeout(fetchImpl(url, { headers }), 10_000, '获取模型列表超时');
  if (!resp.ok) {
    // 把 HTTP 状态挂到 error.status，供 classifyListModelsError 区分鉴权/服务器/请求错误。
    // 消息用语言中性英文：它会经 {message} 注入前端 i18n 模板，避免对 en/ja 用户夹带中文。
    const err = new Error(`list-models request failed (${resp.status})`) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map(m => m.id).filter((id): id is string => !!id);
}

function tryParseQuant(quantJson: string | undefined, out: typeof outputJson): QuantBundle | undefined | false {
  if (!quantJson) return undefined;
  try { return JSON.parse(quantJson); }
  catch { out(errorEnvelope('ERR_INVALID_PARAM', 'quantJson 格式无效')); return false; }
}

export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
  apiKey?: string;
  api_key?: string;
}

interface HandlerDeps {
  _out?: typeof outputJson;
  _analyze?: typeof AnalysisFn;
  _fetchBundle?: typeof FetchBundleFn;
  _analyzeOnly?: typeof AnalyzeFn;
  /** 测试注入：替换真实的列模型 HTTP 拉取，避开网络 */
  _listModelsFetch?: typeof fetchProviderModels;
}

export function createHandlers(deps: HandlerDeps = {}) {
  const out = deps._out ?? outputJson;
  const listModelsFetch = deps._listModelsFetch ?? fetchProviderModels;

  return {
    /**
     * 获取模型列表 - 不触发 playwright 加载
     * - ollama：走本地 SDK 真实拉取
     * - 有列模型端点的云端 provider（openai/anthropic/deepseek/glm）：真打 /models，空结果回退静态目录
     * - 无端点 provider：直接返回静态精选目录（防御兜底，当前所有云端 provider 均有端点）
     */
    async handleListModels(rawConfig: RawConfig) {
      try {
        const provider = (rawConfig.provider || 'ollama') as ProviderType;
        const baseUrl = rawConfig.baseUrl || rawConfig.base_url || undefined;
        const apiKey = rawConfig.apiKey || rawConfig.api_key || '';

        if (provider === 'ollama') {
          logger.info(`正在连接 Ollama 服务: ${baseUrl ?? 'default'}`);
          const { Ollama } = await import('ollama');
          const ollama = new Ollama({ host: baseUrl });

          const list = await withTimeout(
            ollama.list(),
            10_000,
            "获取 Ollama 模型列表超时，请检查服务是否响应"
          );

          out(successEnvelope({ models: list.models.map(m => m.name) }));
          return;
        }

        const caps = PROVIDER_CAPS[provider];
        // 无公开列模型端点 → 返回静态精选目录（防御兜底，当前所有云端 provider 均有端点）
        if (!caps?.modelsPath) {
          out(successEnvelope({ models: staticModelValues(provider) }));
          return;
        }

        const effectiveBaseUrl = baseUrl || PROVIDER_PROFILES[provider].baseUrl;
        const models = await listModelsFetch(provider, effectiveBaseUrl, apiKey);
        // 真实列表为空时回退静态目录，避免下拉空白
        out(successEnvelope({ models: models.length ? models : staticModelValues(provider) }));
      } catch (error) {
        const { code, message } = classifyListModelsError(error);
        logger.error(`获取模型列表失败 [${code}]: ${message}`);
        out(errorEnvelope(code, message));
      }
    },

    /**
     * 获取股票信息
     */
    async handleInfo(symbol: string) {
      if (!symbol) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供股票代码'));
        return;
      }
      try {
        const { parseSymbol } = await import('./parsers/exchange');
        const { fetchStockInfo } = await import('./stock-info');
        const parsed = parseSymbol(symbol);
        const info = await fetchStockInfo(parsed);
        if (info) {
          out(successEnvelope(info));
        } else {
          out(errorEnvelope('ERR_NOT_FOUND', `未找到股票 "${symbol}" 的信息`));
        }
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_INFO', error));
      }
    },

    /**
     * 搜索股票
     */
    async handleSearch(keyword: string) {
      if (!keyword) {
        out(successEnvelope([]));
        return;
      }
      try {
        const { searchStocks } = await import('./search');
        const results = await searchStocks(keyword);
        out(successEnvelope(results));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_SEARCH', error));
      }
    },

    /**
     * 拉取 K 线
     */
    async handleKline(reqJson: string) {
      try {
        const req = JSON.parse(reqJson);
        if (!req?.symbol) {
          out(errorEnvelope('ERR_MISSING_PARAM', '未提供 symbol'));
          return;
        }
        const { getKline } = await import("./kline");
        const points = await getKline(req);
        out(successEnvelope(points));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_KLINE', error));
      }
    },

    /**
     * 拉取实时报价
     */
    async handleQuote(symbol: string) {
      if (!symbol) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供 symbol'));
        return;
      }
      try {
        const { getQuote } = await import("./kline");
        const quote = await getQuote(symbol);
        out(successEnvelope(quote));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUOTE', error));
      }
    },

    /**
     * 执行完整分析 - 此处才会触发 playwright 相关的 scraper 加载
     * （保留向后兼容；新交互流程走 handleFetchBundle + handleAnalyzeOnly）
     */
    async handleAnalysis(symbol: string, config: ResolvedConfig) {
      try {
        const analyze = deps._analyze ?? (await import('./analysis')).performFullAnalysis;
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
        const fetchBundle = deps._fetchBundle ?? (await import('./analysis')).fetchMarketBundle;
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
    async handleAnalyzeOnly(symbol: string, news: StockNews[], config: ResolvedConfig, quantJson?: string) {
      try {
        if (!Array.isArray(news) || news.length === 0) {
          out(errorEnvelope('ERR_MISSING_PARAM', '未提供有效的 news 数组，请先拉取新闻'));
          return;
        }
        const quant = tryParseQuant(quantJson, out);
        if (quant === false) return;
        const analyzeOnly = deps._analyzeOnly ?? (await import('./analysis')).analyzeNewsWithLLM;
        const analysis = await analyzeOnly(symbol, news, config.provider, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelName,
          language: config.language,
        }, quant);
        out(successEnvelope(analysis));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_ANALYSIS_FAILED', error));
      }
    },

    async handleQuant(symbol: string) {
      if (!symbol) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供股票代码'));
        return;
      }
      try {
        const { fetchQuantBundle } = await import('./quant');
        const bundle = await fetchQuantBundle(symbol);
        out(successEnvelope(bundle));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUANT', error));
      }
    },

    async handleBacktest(symbol: string) {
      if (!symbol) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供股票代码'));
        return;
      }
      try {
        const { getKline } = await import('./kline');
        const kline = await getKline({ symbol, period: '1d', range: '1y' });
        if (kline.length < 60) {
          out(errorEnvelope('ERR_INSUFFICIENT_DATA', `K 线数据不足（${kline.length} 天），需要至少 60 天`));
          return;
        }
        const { runBacktest } = await import('./backtest/engine');
        const result = runBacktest(kline, {
          symbol,
          period: kline.length,
          buyThreshold: 65,
          sellThreshold: 40,
          initialCapital: 100000,
          transactionCost: 0.001,
        });
        out(successEnvelope(result));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_BACKTEST', error));
      }
    },

    async handleDeepAnalysis(symbol: string, news: StockNews[], config: ResolvedConfig, quantJson?: string) {
      try {
        if (!Array.isArray(news) || news.length === 0) {
          out(errorEnvelope('ERR_MISSING_PARAM', '深度分析需要 news 数据'));
          return;
        }
        let quant = tryParseQuant(quantJson, out);
        if (quant === false) return;
        if (!quant) {
          const { fetchQuantBundle } = await import('./quant');
          quant = await fetchQuantBundle(symbol);
        }
        const { createChatProvider } = await import('./agents/chat-adapter');
        const { runDeepAnalysis, concurrencyForProvider } = await import('./deep-analysis');
        const { brain, quick } = config.roles;
        // 大师 + 综合走 brain；情绪逐条标注走 quick（可指向更便宜的模型）
        const chat = createChatProvider({
          provider: brain.provider,
          apiKey: brain.apiKey,
          baseUrl: brain.baseUrl,
          modelName: brain.model,
        });
        const sentimentChat = createChatProvider({
          provider: quick.provider,
          apiKey: quick.apiKey,
          baseUrl: quick.baseUrl,
          modelName: quick.model,
        });
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
        });
        out(successEnvelope(result));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_DEEP_ANALYSIS', error));
      }
    },

    /**
     * 对话式追问 — 基于已抓上下文做多轮自然语言问答，复用 provider 配置
     */
    async handleChat(payload: ChatPayload, config: ResolvedConfig) {
      try {
        if (!payload?.question?.trim()) {
          out(errorEnvelope('ERR_MISSING_PARAM', '未提供问题'));
          return;
        }
        const { runChat, buildChatMessages } = await import('./chat');
        const messages = buildChatMessages(payload, config.language);
        // 对话追问走 summarize 角色（基于已抓上下文的信息提炼，可用更便宜的模型）
        const { summarize } = config.roles;
        const reply = await runChat({
          provider: summarize.provider,
          apiKey: summarize.apiKey,
          baseUrl: summarize.baseUrl,
          modelName: summarize.model,
        }, messages);
        out(successEnvelope({ reply }));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_CHAT', error));
      }
    },
  };
}

export const Handlers = createHandlers();
