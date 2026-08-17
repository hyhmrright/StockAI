import { describe, it, expect, mock } from 'bun:test';
import { createHandlers } from './index';
import { ScrapeEmptyError } from '../errors';
import {
  createMockAnalysisResponse,
  createMockNews,
  createMockAIResult,
} from '../../shared/test-utils';
import type { ResolvedConfig } from '../configResolver';

const baseConfig: ResolvedConfig = {
  provider: 'openai',
  apiKey: 'key',
  baseUrl: 'url',
  modelName: 'model',
  deepMode: true,
};

describe('handleAnalysis', () => {
  it('应该成功执行分析并输出 JSON', async () => {
    const mockOut = mock(() => {});
    const mockResult = createMockAnalysisResponse();
    const mockAnalyze = mock(async () => mockResult);

    const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });

    await handlers.handleAnalysis('AAPL', baseConfig);

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

    await handlers.handleAnalysis('AAPL', baseConfig);

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

    await handlers.handleAnalysis('AAPL', baseConfig);

    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_SCRAPE_EMPTY' }),
    });
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
