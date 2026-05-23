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
import type { performFullAnalysis as AnalysisFn } from './analysis';
import { ScrapeEmptyError } from './analysis';
import type { ResolvedConfig } from './configResolver';

export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
}

interface HandlerDeps {
  _out?: typeof outputJson;
  _analyze?: typeof AnalysisFn;
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
     */
    async handleAnalysis(symbol: string, config: ResolvedConfig) {
      try {
        const analyze = deps._analyze ?? (await import('./analysis')).performFullAnalysis;
        const result = await analyze(symbol, config.provider, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelName,
          deepMode: config.deepMode,
        });
        out(successEnvelope(result));
      } catch (error) {
        const code = error instanceof ScrapeEmptyError ? 'ERR_SCRAPE_EMPTY' : 'ERR_ANALYSIS_FAILED';
        out(errorEnvelope(code, toErrorMessage(error)));
      }
    },
  };
}

export const Handlers = createHandlers();
