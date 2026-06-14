import { describe, it, expect, mock } from 'bun:test';
import { createHandlers } from './cli-handlers';
import { ScrapeEmptyError } from './analysis';
import { createMockAnalysisResponse, createMockNews, createMockAIResult } from '../shared/test-utils';
import type { ResolvedConfig } from './configResolver';

const baseConfig: ResolvedConfig = {
  provider: 'openai', apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true,
};

describe('CLI Handlers', () => {
  describe('handleAnalysis', () => {
    it('应该成功执行分析并输出 JSON', async () => {
      const mockOut = mock(() => {});
      const mockResult = createMockAnalysisResponse();
      const mockAnalyze = mock(async () => mockResult);

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = { provider: 'openai', apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

      await handlers.handleAnalysis('AAPL', config);

      expect(mockAnalyze).toHaveBeenCalledWith(
        'AAPL',
        'openai',
        expect.objectContaining({ apiKey: 'key', model: 'model' }),
      );
      expect(mockOut).toHaveBeenCalledWith({ data: mockResult });
    });

    it('分析失败时应该输出错误 JSON', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => { throw new Error('Analysis Failed'); });

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = { provider: 'openai', apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

      await handlers.handleAnalysis('AAPL', config);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ 
          code: 'ERR_ANALYSIS_FAILED', 
          message: expect.stringContaining('Analysis Failed') 
        }),
      });
    });

    it('抓取为空时应该返回 ERR_SCRAPE_EMPTY', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => { throw new ScrapeEmptyError('未搜寻到股票相关新闻'); });

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = { provider: 'openai', apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

      await handlers.handleAnalysis('AAPL', config);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_SCRAPE_EMPTY' }),
      });
    });
  });

  describe('handleInfo', () => {
    it('空 symbol 应返回 ERR_MISSING_PARAM', async () => {
      const mockOut = mock(() => {});
      const handlers = createHandlers({ _out: mockOut });

      await handlers.handleInfo('');

      expect(mockOut).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }) }),
      );
    });
  });

  describe('handleListModels', () => {
    it('有端点的云端 provider 真打 API，输出拉到的模型列表', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => ['gpt-4o', 'o3', 'gpt-4.1']);
      const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

      await handlers.handleListModels({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x' });

      expect(mockFetch).toHaveBeenCalledWith('openai', 'https://api.openai.com/v1', 'sk-x');
      const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
      expect(call.data.models).toEqual(['gpt-4o', 'o3', 'gpt-4.1']);
    });

    it('真实列表为空时回退到静态目录', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => [] as string[]);
      const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

      await handlers.handleListModels({ provider: 'openai', apiKey: 'sk-x' });

      const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
      expect(call.data.models.length).toBeGreaterThan(0);
    });

    it('拉取失败（鉴权错误）映射到稳定错误码', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => {
        const err = new Error('Unauthorized') as Error & { status?: number };
        err.status = 401;
        throw err;
      });
      const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

      await handlers.handleListModels({ provider: 'deepseek', apiKey: 'bad' });

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_LIST_MODELS_AUTH' }),
      });
    });

    it('无列模型端点的 provider（glm）直接返回静态目录，不发请求', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => ['should-not-be-called']);
      const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

      await handlers.handleListModels({ provider: 'glm', apiKey: 'sk-x' });

      expect(mockFetch).not.toHaveBeenCalled();
      const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
      expect(call.data.models.length).toBeGreaterThan(0);
    });
  });

  describe('handleFetchBundle', () => {
    it('成功抓取返回 MarketBundle 信封', async () => {
      const mockOut = mock(() => {});
      const news = [createMockNews()];
      const mockFetch = mock(async () => ({ symbol: 'AAPL', news, stockInfo: undefined }));

      const handlers = createHandlers({ _out: mockOut, _fetchBundle: mockFetch });
      await handlers.handleFetchBundle('AAPL', baseConfig);

      expect(mockFetch).toHaveBeenCalledWith('AAPL', true);
      const call = mockOut.mock.calls[0][0] as { data: { symbol: string } };
      expect(call.data.symbol).toBe('AAPL');
    });

    it('抓取为空映射到 ERR_SCRAPE_EMPTY', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => { throw new ScrapeEmptyError('no news'); });

      const handlers = createHandlers({ _out: mockOut, _fetchBundle: mockFetch });
      await handlers.handleFetchBundle('XYZ', baseConfig);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_SCRAPE_EMPTY' }),
      });
    });

    it('其他异常映射到 ERR_BUNDLE_FAILED', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => { throw new Error('network down'); });

      const handlers = createHandlers({ _out: mockOut, _fetchBundle: mockFetch });
      await handlers.handleFetchBundle('AAPL', baseConfig);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_BUNDLE_FAILED' }),
      });
    });
  });

  describe('handleAnalyzeOnly', () => {
    it('news 为空时返回 ERR_MISSING_PARAM 且不调 LLM', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => createMockAIResult());

      const handlers = createHandlers({ _out: mockOut, _analyzeOnly: mockAnalyze });
      await handlers.handleAnalyzeOnly('AAPL', [], baseConfig);

      expect(mockAnalyze).not.toHaveBeenCalled();
      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }),
      });
    });

    it('news 有内容时调用 LLM 并返回 analysis 信封', async () => {
      const mockOut = mock(() => {});
      const mockResult = createMockAIResult();
      const mockAnalyze = mock(async () => mockResult);
      const news = [createMockNews()];

      const handlers = createHandlers({ _out: mockOut, _analyzeOnly: mockAnalyze });
      await handlers.handleAnalyzeOnly('AAPL', news, baseConfig);

      expect(mockAnalyze).toHaveBeenCalledWith('AAPL', news, 'openai', expect.objectContaining({ apiKey: 'key', model: 'model' }), undefined);
      expect(mockOut).toHaveBeenCalledWith({ data: mockResult });
    });

    it('LLM 异常映射到 ERR_ANALYSIS_FAILED', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => { throw new Error('rate limit'); });
      const news = [createMockNews()];

      const handlers = createHandlers({ _out: mockOut, _analyzeOnly: mockAnalyze });
      await handlers.handleAnalyzeOnly('AAPL', news, baseConfig);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_ANALYSIS_FAILED' }),
      });
    });
  });
});
