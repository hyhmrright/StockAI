import { performFullAnalysis } from './analysis';
import { toErrorMessage, outputJson, withTimeout, logger } from './utils';
import { ResolvedConfig } from './configResolver';
import { DEFAULT_OPENAI_MODELS } from './config';

export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
}

interface HandlerDeps {
  _out?: typeof outputJson;
  _analyze?: typeof performFullAnalysis;
}

export function createHandlers(deps: HandlerDeps = {}) {
  const out = deps._out ?? outputJson;
  const analyze = deps._analyze ?? performFullAnalysis;

  return {
    async handleListModels(rawConfig: RawConfig) {
      try {
        const provider = rawConfig.provider || 'ollama';
        const baseUrl = rawConfig.baseUrl || rawConfig.base_url || undefined;

        if (provider === 'ollama') {
          logger.info(`正在连接 Ollama 服务: ${baseUrl ?? 'default'}`);
          // 动态导入以避免启动时的依赖加载问题
          const { Ollama } = await import('ollama');
          const ollama = new Ollama({ host: baseUrl });

          // 给列表查询也加一个超时，防止无响应挂起
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

    async handleAnalysis(symbol: string, config: ResolvedConfig) {
      try {
        const result = await analyze(symbol, config.provider, {
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
