import { toErrorMessage, outputJson, withTimeout, logger } from './utils';
import { DEFAULT_OPENAI_MODELS } from './config';

export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
}

interface HandlerDeps {
  _out?: typeof outputJson;
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

          out({ data: { models: list.models.map(m => m.name) } });
        } else {
          out({ data: { models: DEFAULT_OPENAI_MODELS } });
        }
      } catch (error) {
        const msg = toErrorMessage(error);
        logger.error(`获取模型列表失败: ${msg}`);
        out({ error: { code: 'ERR_LIST_MODELS', message: msg } });
      }
    },

    /**
     * 获取股票信息
     */
    async handleInfo(symbol: string) {
      if (!symbol) {
        out({ error: { code: 'ERR_MISSING_PARAM', message: '未提供股票代码' } });
        return;
      }
      try {
        const { parseSymbol } = await import('./parsers/exchange');
        const { fetchStockInfo } = await import('./stock-info');
        const parsed = parseSymbol(symbol);
        const info = await fetchStockInfo(parsed);
        if (info) {
          out({ data: info });
        } else {
          out({ error: { code: 'ERR_NOT_FOUND', message: `未找到股票 "${symbol}" 的信息` } });
        }
      } catch (error) {
        out({ error: { code: 'ERR_INFO', message: toErrorMessage(error) } });
      }
    },

    /**
     * 搜索股票
     */
    async handleSearch(keyword: string) {
      if (!keyword) {
        out({ data: [] });
        return;
      }
      try {
        const { searchStocks } = await import('./search');
        const results = await searchStocks(keyword);
        out({ data: results });
      } catch (error) {
        out({ error: { code: 'ERR_SEARCH', message: toErrorMessage(error) } });
      }
    },

    /**
     * 执行完整分析 - 此处才会触发 playwright 相关的 scraper 加载
     */
    async handleAnalysis(symbol: string, config: any) {
      try {
        const { performFullAnalysis } = await import('./analysis');
        const result = await performFullAnalysis(symbol, config.provider, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.modelName,
          deepMode: config.deepMode,
        });
        out({ data: result });
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        out({
          error: {
            code: errorMessage.includes('未搜寻到') ? 'ERR_SCRAPE_EMPTY' : 'ERR_ANALYSIS_FAILED',
            message: errorMessage,
          },
        });
      }
    },
  };
}

export const Handlers = createHandlers();
