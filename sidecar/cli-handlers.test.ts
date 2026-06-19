import { describe, it, expect, mock } from 'bun:test';
import { createHandlers, fetchProviderModels } from './cli-handlers';
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

    it('glm 也有列模型端点（智谱 /models），真打 API 输出拉到的模型', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => ['glm-4.6', 'glm-4-flash']);
      const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

      await handlers.handleListModels({ provider: 'glm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'sk-x' });

      expect(mockFetch).toHaveBeenCalledWith('glm', 'https://open.bigmodel.cn/api/paas/v4', 'sk-x');
      const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
      expect(call.data.models).toEqual(['glm-4.6', 'glm-4-flash']);
    });
  });

  // 直接覆盖真实解析路径（handleListModels 测试都 mock 掉了 _listModelsFetch，解析逻辑此前无覆盖）
  describe('fetchProviderModels（真实响应解析）', () => {
    it('解析智谱 /models 的 OpenAI 形状 {data:[{id}]}，并拼对 URL 与 bearer 头', async () => {
      const captured: { url?: string; auth?: string } = {};
      const fakeFetch = (async (url: string, init: { headers: Record<string, string> }) => {
        captured.url = url;
        captured.auth = init.headers.Authorization;
        // data 里混入 embedding 等非对话模型——与其它 provider 一样如实返回、不过滤
        return new Response(JSON.stringify({
          data: [{ id: 'glm-4.6', created: 3 }, { id: 'glm-5.1', created: 2 }, { id: 'embedding-3', created: 1 }],
        }), { status: 200 });
      }) as unknown as typeof fetch;

      const models = await fetchProviderModels('glm', 'https://open.bigmodel.cn/api/paas/v4', 'sk-real', fakeFetch);

      expect(captured.url).toBe('https://open.bigmodel.cn/api/paas/v4/models');
      expect(captured.auth).toBe('Bearer sk-real');
      expect(models).toEqual(['glm-4.6', 'glm-5.1', 'embedding-3']);
    });

    it('非 2xx 响应抛出带 status 的错误，供 classifyListModelsError 归类', async () => {
      const fakeFetch = (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
      await expect(
        fetchProviderModels('glm', 'https://open.bigmodel.cn/api/paas/v4', 'bad', fakeFetch),
      ).rejects.toMatchObject({ status: 401 });
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
