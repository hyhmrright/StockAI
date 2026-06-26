import { mock, describe, test, expect, beforeEach } from 'bun:test';
import type { StockNews } from '../shared/types';
import type { ScrapeStrategy, ScrapeContext } from './strategies/base';
import { scrapeStockNews } from './scraper';
import { createMockNews } from '../shared/test-utils';

const NEWS_A: StockNews[] = [createMockNews({ title: '策略A新闻' })];
const NEWS_B: StockNews[] = [createMockNews({ title: '策略B新闻' })];

/** 创建模拟策略 */
function makeStrategy(
  name: string,
  impl: (symbol: string, ctx: ScrapeContext) => Promise<StockNews[]>,
): ScrapeStrategy {
  return { name, scrape: impl };
}

/** 创建模拟 BrowserManager（只关心 close 是否被调用） */
function makeBrowserMgr() {
  const closeFn = mock(() => Promise.resolve());
  return {
    mgr: {
      getPage: mock(() => Promise.resolve({} as any)),
      close: closeFn,
      // BrowserManager 其余属性测试无需关注
    } as any,
    closeFn,
  };
}

describe('scrapeStockNews', () => {
  test('首个返回结果的策略胜出，后续策略不执行', async () => {
    const strategyB = mock(() => Promise.resolve(NEWS_B));
    const strategies = [
      makeStrategy('A', () => Promise.resolve(NEWS_A)),
      makeStrategy('B', strategyB),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('策略A新闻');
    expect(strategyB).not.toHaveBeenCalled();
  });

  test('deepMode=true 时调用 extractContent 补齐正文', async () => {
    const extractContent = mock(() => Promise.resolve('完整正文内容'));
    const strategies = [makeStrategy('RSS', () => Promise.resolve(NEWS_A))];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', true, {
      strategies,
      browserMgr: mgr,
      extractContent,
    });

    expect(extractContent).toHaveBeenCalledTimes(1);
    expect(result[0].content).toBe('完整正文内容');
  });

  test('deepMode=false 时不调用 extractContent', async () => {
    const extractContent = mock(() => Promise.resolve('不应出现'));
    const strategies = [makeStrategy('RSS', () => Promise.resolve(NEWS_A))];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, {
      strategies,
      browserMgr: mgr,
      extractContent,
    });

    expect(extractContent).not.toHaveBeenCalled();
    expect(result[0].title).toBe('策略A新闻');
  });

  test('策略首次失败后重试成功', async () => {
    let attempt = 0;
    const strategies = [
      makeStrategy('Flaky', () => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error('临时网络错误'));
        return Promise.resolve(NEWS_A);
      }),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(result).toHaveLength(1);
    expect(attempt).toBe(2);
  });

  test('策略重试两次均失败后回退到下一个策略', async () => {
    const strategies = [
      makeStrategy('Bad', () => Promise.reject(new Error('永远失败'))),
      makeStrategy('Good', () => Promise.resolve(NEWS_B)),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('策略B新闻');
  });

  test('策略返回空数组时跳到下一个策略', async () => {
    const strategies = [
      makeStrategy('Empty', () => Promise.resolve([])),
      makeStrategy('HasData', () => Promise.resolve(NEWS_B)),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('策略B新闻');
  });

  test('所有策略均无结果时返回空数组', async () => {
    const strategies = [
      makeStrategy('Empty1', () => Promise.resolve([])),
      makeStrategy('Empty2', () => Promise.resolve([])),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(result).toHaveLength(0);
  });

  test('无论成功或失败，browserMgr.close 始终被调用', async () => {
    const strategies = [makeStrategy('Fail', () => Promise.reject(new Error('爆炸')))];
    const { mgr, closeFn } = makeBrowserMgr();

    await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  test('成功路径也调用 browserMgr.close', async () => {
    const strategies = [makeStrategy('OK', () => Promise.resolve(NEWS_A))];
    const { mgr, closeFn } = makeBrowserMgr();

    await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr });

    expect(closeFn).toHaveBeenCalledTimes(1);
  });
});
