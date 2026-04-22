import { Ollama } from 'ollama';
import { performFullAnalysis } from './analysis';
import { toErrorMessage, outputJson } from './utils';
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
        // undefined 让 Ollama SDK 回退到 localhost:11434；'' 会构造畸形 URL
        const baseUrl = rawConfig.baseUrl || rawConfig.base_url || undefined;

        if (provider === 'ollama') {
          const ollama = new Ollama({ host: baseUrl });
          const list = await ollama.list();
          out({ data: { models: list.models.map(m => m.name) } });
        } else {
          out({ data: { models: DEFAULT_OPENAI_MODELS } });
        }
      } catch (error) {
        out({ error: { code: 'ERR_LIST_MODELS', message: toErrorMessage(error) } });
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
