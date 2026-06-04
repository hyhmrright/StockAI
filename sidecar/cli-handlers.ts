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
import { DEFAULT_OPENAI_MODELS } from './config';
import type {
  performFullAnalysis as AnalysisFn,
  fetchMarketBundle as FetchBundleFn,
  analyzeNewsWithLLM as AnalyzeFn,
} from './analysis';
import { ScrapeEmptyError } from './analysis';
import type { ResolvedConfig } from './configResolver';
import type { StockNews, QuantBundle, ChatPayload } from '../shared/types';

function tryParseQuant(quantJson: string | undefined, out: typeof outputJson): QuantBundle | undefined | false {
  if (!quantJson) return undefined;
  try { return JSON.parse(quantJson); }
  catch { out(errorEnvelope('ERR_INVALID_PARAM', 'quantJson 格式无效')); return false; }
}

export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
}

interface HandlerDeps {
  _out?: typeof outputJson;
  _analyze?: typeof AnalysisFn;
  _fetchBundle?: typeof FetchBundleFn;
  _analyzeOnly?: typeof AnalyzeFn;
}

export function createHandlers(deps: HandlerDeps = {}) {
  const out = deps._out ?? outputJson;

  return {
    /**
     * 获取模型列表 - 仅依赖 ollama，不触发 playwright 加载
     */
    async handleListModels(rawConfig: RawConfig) {
      try {
        const provider = rawConfig.provider || 'ollama';
        const baseUrl = rawConfig.baseUrl || rawConfig.base_url || undefined;

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
        } else {
          out(successEnvelope({ models: DEFAULT_OPENAI_MODELS }));
        }
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
        const chat = createChatProvider({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          modelName: config.modelName,
        });
        const result = await runDeepAnalysis({
          symbol,
          quant,
          news,
          chat,
          selectedMasters: config.selectedMasters,
          language: config.language,
          concurrency: concurrencyForProvider(config.provider),
          // 缓存指纹含 provider+model：换模型即 miss，避免不同模型复用同一结果
          cacheFingerprint: `${config.provider}:${config.modelName}`,
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
        const reply = await runChat({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          modelName: config.modelName,
        }, messages);
        out(successEnvelope({ reply }));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_CHAT', error));
      }
    },
  };
}

export const Handlers = createHandlers();
