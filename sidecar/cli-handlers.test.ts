import { describe, it, expect, mock } from 'bun:test';
import { createHandlers, fetchProviderModels } from './cli-handlers';
import { ScrapeEmptyError } from './analysis';
import {
  createMockAnalysisResponse,
  createMockNews,
  createMockAIResult,
} from '../shared/test-utils';
import type { ResolvedConfig } from './configResolver';
import type { ChatPayload, ReportChunk } from '../shared/types';

const baseConfig: ResolvedConfig = {
  provider: 'openai',
  apiKey: 'key',
  baseUrl: 'url',
  modelName: 'model',
  deepMode: true,
};

const chatRole = { provider: 'openai' as const, apiKey: 'k', baseUrl: 'u', model: 'm' };
const chatConfig: ResolvedConfig = {
  provider: 'openai',
  apiKey: 'k',
  baseUrl: 'u',
  modelName: 'm',
  deepMode: true,
  masterAnalysis: false,
  selectedMasters: [],
  language: 'zh',
  roles: { brain: chatRole, quick: chatRole, summarize: chatRole },
};

describe('CLI Handlers', () => {
  describe('handleAnalysis', () => {
    it('应该成功执行分析并输出 JSON', async () => {
      const mockOut = mock(() => {});
      const mockResult = createMockAnalysisResponse();
      const mockAnalyze = mock(async () => mockResult);

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = {
        provider: 'openai',
        apiKey: 'key',
        baseUrl: 'url',
        modelName: 'model',
        deepMode: true,
      };

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
      const mockAnalyze = mock(async () => {
        throw new Error('Analysis Failed');
      });

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = {
        provider: 'openai',
        apiKey: 'key',
        baseUrl: 'url',
        modelName: 'model',
        deepMode: true,
      };

      await handlers.handleAnalysis('AAPL', config);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'ERR_ANALYSIS_FAILED',
          message: expect.stringContaining('Analysis Failed'),
        }),
      });
    });

    it('抓取为空时应该返回 ERR_SCRAPE_EMPTY', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => {
        throw new ScrapeEmptyError('未搜寻到股票相关新闻');
      });

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config: ResolvedConfig = {
        provider: 'openai',
        apiKey: 'key',
        baseUrl: 'url',
        modelName: 'model',
        deepMode: true,
      };

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

      await handlers.handleListModels({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-x',
      });

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

      await handlers.handleListModels({
        provider: 'glm',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: 'sk-x',
      });

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
        return new Response(
          JSON.stringify({
            data: [
              { id: 'glm-4.6', created: 3 },
              { id: 'glm-5.1', created: 2 },
              { id: 'embedding-3', created: 1 },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const models = await fetchProviderModels(
        'glm',
        'https://open.bigmodel.cn/api/paas/v4',
        'sk-real',
        fakeFetch,
      );

      expect(captured.url).toBe('https://open.bigmodel.cn/api/paas/v4/models');
      expect(captured.auth).toBe('Bearer sk-real');
      expect(models).toEqual(['glm-4.6', 'glm-5.1', 'embedding-3']);
    });

    it('非 2xx 响应抛出带 status 的错误，供 classifyListModelsError 归类', async () => {
      const fakeFetch = (async () =>
        new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
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
      const mockFetch = mock(async () => {
        throw new ScrapeEmptyError('no news');
      });

      const handlers = createHandlers({ _out: mockOut, _fetchBundle: mockFetch });
      await handlers.handleFetchBundle('XYZ', baseConfig);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_SCRAPE_EMPTY' }),
      });
    });

    it('其他异常映射到 ERR_BUNDLE_FAILED', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => {
        throw new Error('network down');
      });

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

      expect(mockAnalyze).toHaveBeenCalledWith(
        'AAPL',
        news,
        'openai',
        expect.objectContaining({ apiKey: 'key', model: 'model' }),
        undefined,
      );
      expect(mockOut).toHaveBeenCalledWith({ data: mockResult });
    });

    it('LLM 异常映射到 ERR_ANALYSIS_FAILED', async () => {
      const mockOut = mock(() => {});
      const mockAnalyze = mock(async () => {
        throw new Error('rate limit');
      });
      const news = [createMockNews()];

      const handlers = createHandlers({ _out: mockOut, _analyzeOnly: mockAnalyze });
      await handlers.handleAnalyzeOnly('AAPL', news, baseConfig);

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_ANALYSIS_FAILED' }),
      });
    });
  });

  describe('handleFinancialHistory', () => {
    const mockHistory = {
      symbol: '600519',
      market: 'A股' as const,
      snapshots: [{ reportDate: '2026-03-31', reportType: '一季报', roe: 10.57 }],
      fetchedAt: 1,
    };

    it('空 symbol 返回 ERR_MISSING_PARAM 且不抓取', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => mockHistory);
      const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

      await handlers.handleFinancialHistory('');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockOut).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }) }),
      );
    });

    it('缺省 periods → 默认 12 期，输出成功信封', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => mockHistory);
      const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

      await handlers.handleFinancialHistory('600519');

      expect(mockFetch).toHaveBeenCalledWith('600519', 12);
      expect(mockOut).toHaveBeenCalledWith({ data: mockHistory });
    });

    it('periods 字符串被解析为整数传入', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => mockHistory);
      const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

      await handlers.handleFinancialHistory('600519', '8');

      expect(mockFetch).toHaveBeenCalledWith('600519', 8);
    });

    it('非法 periods 回退默认 12', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => mockHistory);
      const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

      await handlers.handleFinancialHistory('600519', 'abc');

      expect(mockFetch).toHaveBeenCalledWith('600519', 12);
    });

    it('抓取异常映射到 ERR_FIN_HISTORY', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => {
        throw new Error('东财 F10 历史 HTTP 500');
      });
      const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

      await handlers.handleFinancialHistory('600519');

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_FIN_HISTORY' }),
      });
    });
  });

  describe('handleMarketSnapshot', () => {
    const mockSnapshot = {
      entries: [{ symbol: '600519', name: '贵州茅台', pe: 22.1, marketCap: 2_000_000_000_000 }],
      fetchedAt: 1,
      total: 1,
    };

    it('成功抓取返回 MarketSnapshot 信封', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => mockSnapshot);
      const handlers = createHandlers({ _out: mockOut, _fetchMarketSnapshot: mockFetch });

      await handlers.handleMarketSnapshot();

      expect(mockFetch).toHaveBeenCalled();
      expect(mockOut).toHaveBeenCalledWith({ data: mockSnapshot });
    });

    it('抓取异常映射到 ERR_MARKET_SNAPSHOT', async () => {
      const mockOut = mock(() => {});
      const mockFetch = mock(async () => {
        throw new Error('东财 clist HTTP 502');
      });
      const handlers = createHandlers({ _out: mockOut, _fetchMarketSnapshot: mockFetch });

      await handlers.handleMarketSnapshot();

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_MARKET_SNAPSHOT' }),
      });
    });
  });

  describe('handleChat · 财报 RAG 集成', () => {
    const chunk: ReportChunk = {
      text: '问：营收为何下滑？\n答：主要受行业需求疲软影响。',
      docTitle: '投资者互动问答',
      docDate: '2024-04-01',
      url: 'https://sns.sseinfo.com/company.do?stockcode=600519',
      position: '问答 #7',
    };
    const payload: ChatPayload = {
      symbol: '000001',
      question: '营收为何下滑',
      history: [],
      context: {},
    };

    it('检索到 chunk → 注入 context 且 citations 含 report 项', async () => {
      const mockOut = mock(() => {});
      const retrieve = mock(async () => [chunk]);
      // LLM 回答里带 [src:report:1]，走 extractCitations report 分支
      let seenSystem = '';
      const runChat = mock(async (_cfg, messages) => {
        seenSystem = messages[0].content;
        return '营收下滑主因需求疲软[src:report:1]。';
      });
      const handlers = createHandlers({
        _out: mockOut,
        _retrieveReportChunks: retrieve,
        _runChat: runChat,
      });

      await handlers.handleChat(structuredClone(payload), chatConfig);

      expect(retrieve).toHaveBeenCalledWith('000001', '营收为何下滑');
      // 注入后 system prompt 含 [投资者互动问答] 段（section header 带方括号，与 guide 内的措辞区分）
      expect(seenSystem).toContain('[投资者互动问答]');
      expect(seenSystem).toContain('营收为何下滑');
      const arg = mockOut.mock.calls[0][0] as { data: { reply: string; citations: unknown[] } };
      expect(arg.data.reply).toBe('营收下滑主因需求疲软[[cite:0]]。');
      expect(arg.data.citations).toEqual([
        {
          index: 0,
          sourceType: 'report',
          sourceRef: 1,
          snippet: chunk.text,
          sourceUrl: chunk.url,
          sourceMeta: { title: chunk.docTitle, date: chunk.docDate, position: chunk.position },
        },
      ]);
    });

    it('retrieval 抛错 → chat 仍正常返回（不 500，不注入 report）', async () => {
      const mockOut = mock(() => {});
      const retrieve = mock(async () => {
        throw new Error('network down');
      });
      const runChat = mock(async () => '普通回答，无来源。');
      const handlers = createHandlers({
        _out: mockOut,
        _retrieveReportChunks: retrieve,
        _runChat: runChat,
      });

      await handlers.handleChat(structuredClone(payload), chatConfig);

      const arg = mockOut.mock.calls[0][0] as { data?: unknown; error?: unknown };
      expect(arg.error).toBeUndefined();
      expect(arg.data).toEqual({ reply: '普通回答，无来源。', citations: [] });
    });

    it('检索为空 → 不注入 report，正常回答', async () => {
      const mockOut = mock(() => {});
      const retrieve = mock(async () => []);
      let seenSystem = '';
      const runChat = mock(async (_cfg, messages) => {
        seenSystem = messages[0].content;
        return '现价约 12 元。';
      });
      const handlers = createHandlers({
        _out: mockOut,
        _retrieveReportChunks: retrieve,
        _runChat: runChat,
      });

      await handlers.handleChat(structuredClone(payload), chatConfig);

      expect(seenSystem).not.toContain('[报告原文]');
      const arg = mockOut.mock.calls[0][0] as { data: { citations: unknown[] } };
      expect(arg.data.citations).toEqual([]);
    });

    it('空问题 → ERR_MISSING_PARAM，不触发检索', async () => {
      const mockOut = mock(() => {});
      const retrieve = mock(async () => [chunk]);
      const handlers = createHandlers({ _out: mockOut, _retrieveReportChunks: retrieve });

      await handlers.handleChat({ ...payload, question: '  ' }, chatConfig);

      expect(retrieve).not.toHaveBeenCalled();
      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }),
      });
    });
  });

  describe('handleIndexReports · 预热', () => {
    const fakeIndex = {
      symbol: '000001',
      builtAt: 0,
      chunks: [1, 2, 3],
      postings: {},
      df: {},
      avgLen: 0,
      lens: [],
    };

    it('建索引成功 → { indexed:true, docCount }', async () => {
      const mockOut = mock(() => {});
      // biome-ignore lint/suspicious/noExplicitAny: 测试桩返回精简索引结构
      const ensure = mock(async () => fakeIndex as any);
      const handlers = createHandlers({ _out: mockOut, _ensureReportIndex: ensure });

      await handlers.handleIndexReports('000001');

      expect(ensure).toHaveBeenCalledWith('000001');
      expect(mockOut).toHaveBeenCalledWith({ data: { indexed: true, docCount: 3 } });
    });

    it('无索引（null）→ { indexed:false, docCount:0 }', async () => {
      const mockOut = mock(() => {});
      const ensure = mock(async () => null);
      const handlers = createHandlers({ _out: mockOut, _ensureReportIndex: ensure });

      await handlers.handleIndexReports('AAPL');

      expect(mockOut).toHaveBeenCalledWith({ data: { indexed: false, docCount: 0 } });
    });

    it('缺 symbol → ERR_MISSING_PARAM', async () => {
      const mockOut = mock(() => {});
      const handlers = createHandlers({ _out: mockOut });

      await handlers.handleIndexReports('');

      expect(mockOut).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }),
      });
    });
  });
});
