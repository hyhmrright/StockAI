import { describe, it, expect, mock } from 'bun:test';
import { createHandlers } from './cli-handlers';
import { createMockAnalysisResponse } from '../shared/test-utils';

describe('CLI Handlers', () => {
  describe('handleAnalysis', () => {
    it('应该成功执行分析并输出 JSON', async () => {
      const mockOut = mock(() => {});
      const mockResult = createMockAnalysisResponse();
      const mockAnalyze = mock(async () => mockResult);

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config = { provider: 'openai' as any, apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

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
      const config = { provider: 'openai' as any, apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

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
      const mockAnalyze = mock(async () => { throw new Error('未搜寻到股票相关新闻'); });

      const handlers = createHandlers({ _out: mockOut, _analyze: mockAnalyze });
      const config = { provider: 'openai' as any, apiKey: 'key', baseUrl: 'url', modelName: 'model', deepMode: true };

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
});
