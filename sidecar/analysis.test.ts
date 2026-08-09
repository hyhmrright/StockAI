import { mock, describe, test, expect, beforeEach } from 'bun:test';
import type { StockNews, AIAnalysisResult, StockInfo } from '../shared/types';
import { performFullAnalysis, fetchMarketBundle, analyzeNewsWithLLM } from './analysis';
import { createMockNews, createMockAIResult } from '../shared/test-utils';

const DEFAULT_NEWS = [createMockNews()];
const DEFAULT_ANALYSIS = createMockAIResult();

/** 测试级依赖工厂——每个 test 构造独立 mocks，避免文件间 mock 状态泄漏 */
function makeDeps(overrides?: {
  scrapeResult?: StockNews[];
  scrapeRejects?: Error;
  fetchInfoResult?: StockInfo | null;
  fetchInfoRejects?: Error;
  analyzeResult?: AIAnalysisResult;
  analyzeRejects?: Error;
}) {
  const scrape = mock(() =>
    overrides?.scrapeRejects
      ? Promise.reject(overrides.scrapeRejects)
      : Promise.resolve(overrides?.scrapeResult ?? DEFAULT_NEWS),
  );

  const fetchInfo = mock(() =>
    overrides?.fetchInfoRejects
      ? Promise.reject(overrides.fetchInfoRejects)
      : Promise.resolve(overrides?.fetchInfoResult ?? null),
  );

  const analyze = mock(() =>
    overrides?.analyzeRejects
      ? Promise.reject(overrides.analyzeRejects)
      : Promise.resolve(overrides?.analyzeResult ?? DEFAULT_ANALYSIS),
  );

  return {
    deps: {
      scrape,
      fetchInfo,
      createProvider: () => ({ kind: 'openai' as const, analyze }),
    },
    mocks: { scrape, fetchInfo, analyze },
  };
}

describe('performFullAnalysis (Sociable Unit Tests)', () => {
  test('ValidInput_ReturnsFullResponse', async () => {
    const { deps } = makeDeps();
    const result = await performFullAnalysis('AAPL', 'openai', { apiKey: 'sk-test' }, deps);

    expect(result.symbol).toBe('AAPL');
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
    expect(result.analysis.rating).toBe(DEFAULT_ANALYSIS.rating);
  });

  test('NoNewsFound_ThrowsErrorWithSymbol', async () => {
    const { deps } = makeDeps({ scrapeResult: [] });

    await expect(performFullAnalysis('INVALID', 'openai', {}, deps)).rejects.toThrow(
      /未搜寻到股票 "INVALID"/,
    );
  });

  test('StockInfoFetchFailure_ContinuesWithUndefinedInfo', async () => {
    const { deps } = makeDeps({ fetchInfoRejects: new Error('Network Timeout') });

    const result = await performFullAnalysis('AAPL', 'openai', {}, deps);
    expect(result.stockInfo).toBeUndefined();
    expect(result.news).toHaveLength(DEFAULT_NEWS.length);
  });

  test('AIProviderFailure_GracefulDegradationToNeutral', async () => {
    const { deps } = makeDeps({ analyzeRejects: new Error('Invalid API Key') });

    const result = await performFullAnalysis('AAPL', 'openai', {}, deps);
    expect(result.analysis.rating).toBe(50);
    expect(result.analysis.sentiment).toBe('neutral');
    expect(result.analysis.summary).toContain('AI 分析服务暂不可用');
  });

  test('AIProviderFailure_language=en_EnglishFallback', async () => {
    const { deps } = makeDeps({ analyzeRejects: new Error('Invalid API Key') });

    const result = await performFullAnalysis('AAPL', 'openai', { language: 'en' }, deps);
    expect(result.analysis.rating).toBe(50);
    expect(result.analysis.sentiment).toBe('neutral');
    expect(result.analysis.summary).toContain('unavailable');
    expect(result.analysis.summary).not.toContain('AI 分析服务暂不可用');
  });
});

describe('fetchMarketBundle (拆分后的纯抓取)', () => {
  test('ReturnsBundleWithoutCallingProvider', async () => {
    const { deps, mocks } = makeDeps();
    const bundle = await fetchMarketBundle('AAPL', true, deps);
    expect(bundle.symbol).toBe('AAPL');
    expect(bundle.news).toHaveLength(DEFAULT_NEWS.length);
    // 抓取阶段不应调用 LLM
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  test('NoNewsFound_ThrowsScrapeEmptyError', async () => {
    const { deps } = makeDeps({ scrapeResult: [] });
    await expect(fetchMarketBundle('INVALID', true, deps)).rejects.toThrow(
      /未搜寻到股票 "INVALID"/,
    );
  });

  test('A 股：股票信息只取一次，且搜索词已用公司名增强', async () => {
    // 防回归：搜索词增强此前自己调 fetchStockInfo，与这里的 fetchInfo 是同一接口的两次请求。
    // 实测一次 A 股 bundle 打出 2 个 hq.sinajs.cn 请求（美股 1 个），该源抖动 0.26s–8.00s，
    // 多出的那次最坏白等 8 秒。旧测试注入 enhance 恒等 stub，恰好把这次重复请求挡在视野外。
    const { deps, mocks } = makeDeps({ fetchInfoResult: { name: '隆基绿能' } as StockInfo });

    const bundle = await fetchMarketBundle('601012', false, deps);

    expect(mocks.fetchInfo).toHaveBeenCalledTimes(1);
    expect(mocks.scrape).toHaveBeenCalledWith('隆基绿能601012', false);
    expect(bundle.stockInfo?.name).toBe('隆基绿能');
  });

  test('A 股：信息源失败时搜索词回退裸代码，新闻照抓', async () => {
    const { deps, mocks } = makeDeps({ fetchInfoRejects: new Error('数据源超时') });

    const bundle = await fetchMarketBundle('601012', false, deps);

    expect(mocks.fetchInfo).toHaveBeenCalledTimes(1);
    expect(mocks.scrape).toHaveBeenCalledWith('601012', false);
    expect(bundle.stockInfo).toBeUndefined();
    expect(bundle.news).toHaveLength(DEFAULT_NEWS.length);
  });

  test('美股：信息与新闻并发，不为拼搜索词而串行等待', async () => {
    // 美股无需公司名，fetchInfo 不该挡在 scrape 前面——这条钉住并发没被重构掉
    let infoResolved = false;
    const scrape = mock(() => {
      expect(infoResolved).toBe(false);
      return Promise.resolve(DEFAULT_NEWS);
    });
    const fetchInfo = mock(
      () =>
        new Promise<StockInfo | null>((res) =>
          setTimeout(() => {
            infoResolved = true;
            res(null);
          }, 20),
        ),
    );

    await fetchMarketBundle('AAPL', false, { scrape, fetchInfo });

    expect(scrape).toHaveBeenCalledTimes(1);
  });
});

describe('analyzeNewsWithLLM (拆分后的纯分析)', () => {
  test('UsesProvidedNewsDirectly', async () => {
    const { deps, mocks } = makeDeps();
    const result = await analyzeNewsWithLLM(
      'AAPL',
      DEFAULT_NEWS,
      'openai',
      { apiKey: 'sk' },
      undefined,
      deps,
    );
    expect(result.rating).toBe(DEFAULT_ANALYSIS.rating);
    // 不应触发抓取
    expect(mocks.scrape).not.toHaveBeenCalled();
    expect(mocks.fetchInfo).not.toHaveBeenCalled();
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  test('ProviderFailure_ReturnsNeutralDegradation', async () => {
    const { deps } = makeDeps({ analyzeRejects: new Error('boom') });
    const result = await analyzeNewsWithLLM('AAPL', DEFAULT_NEWS, 'openai', {}, undefined, deps);
    expect(result.rating).toBe(50);
    expect(result.sentiment).toBe('neutral');
  });
});
