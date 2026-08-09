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
  const newPageFn = mock(() => Promise.resolve({} as any));
  return {
    mgr: {
      getPage: mock(() => Promise.resolve({} as any)),
      newPage: newPageFn,
      close: closeFn,
      // BrowserManager 其余属性测试无需关注
    } as any,
    closeFn,
    newPageFn,
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

  test('永不 settle 的策略被预算打断，而不是拖死整条链', async () => {
    // 复现线上形态：page.content() 在页面持续加载时无限期挂起，策略既不返回也不抛
    const hang = makeStrategy('Hang', () => new Promise<StockNews[]>(() => {}));
    const { mgr, closeFn } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, {
      strategies: [hang],
      browserMgr: mgr,
      budgetMs: 50,
    });

    expect(result).toHaveLength(0);
    expect(closeFn).toHaveBeenCalledTimes(1);
  });

  test('预算耗尽后不再启动后续策略', async () => {
    const later = mock(() => Promise.resolve(NEWS_B));
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', false, {
      strategies: [
        makeStrategy('Hang', () => new Promise<StockNews[]>(() => {})),
        makeStrategy('Later', later),
      ],
      browserMgr: mgr,
      budgetMs: 50,
    });

    expect(result).toHaveLength(0);
    expect(later).not.toHaveBeenCalled();
  });

  test('挂死的正文提取被预算打断，已抓到的新闻概要仍返回', async () => {
    // 正文提取一度逃在预算之外，实测把总耗时顶到 90s（extractFullContent 内的
    // page.evaluate 不接受 timeout，能无限期挂起）
    const strategies = [makeStrategy('RSS', () => Promise.resolve([createMockNews()]))];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', true, {
      strategies,
      browserMgr: mgr,
      extractContent: mock(() => new Promise<string>(() => {})),
      budgetMs: 50,
    });

    expect(result).toHaveLength(1);
  });

  test('多条正文并行提取，而不是一条接一条排队', async () => {
    // 实测串行提取是整条链最大的单项开销：3 条各约 4.3s，合计 12.85s，
    // 占一次 A 股深度模式抓取（21.9s）的 59%。
    let inFlight = 0;
    let peak = 0;
    const extractContent = mock(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return '正文';
    });
    const news = [
      createMockNews({ title: 'a', url: 'https://a' }),
      createMockNews({ title: 'b', url: 'https://b' }),
      createMockNews({ title: 'c', url: 'https://c' }),
    ];
    const { mgr } = makeBrowserMgr();

    await scrapeStockNews('AAPL', true, {
      strategies: [makeStrategy('RSS', () => Promise.resolve(news))],
      browserMgr: mgr,
      extractContent,
    });

    expect(extractContent).toHaveBeenCalledTimes(3);
    expect(peak).toBeGreaterThan(1);
  });

  test('每条正文用各自的页面——同一页面并发导航会互相冲掉', async () => {
    const news = [
      createMockNews({ title: 'a', url: 'https://a' }),
      createMockNews({ title: 'b', url: 'https://b' }),
    ];
    const { mgr, newPageFn } = makeBrowserMgr();

    await scrapeStockNews('AAPL', true, {
      strategies: [makeStrategy('RSS', () => Promise.resolve(news))],
      browserMgr: mgr,
      extractContent: mock(() => Promise.resolve('正文')),
    });

    expect(newPageFn).toHaveBeenCalledTimes(2);
  });

  test('单条正文提取失败不影响其余条目', async () => {
    const news = [
      createMockNews({ title: 'a', url: 'https://a', content: '原摘要A' }),
      createMockNews({ title: 'b', url: 'https://b', content: '原摘要B' }),
    ];
    const { mgr } = makeBrowserMgr();

    const result = await scrapeStockNews('AAPL', true, {
      strategies: [makeStrategy('RSS', () => Promise.resolve(news))],
      browserMgr: mgr,
      extractContent: mock((_p: any, url: string) =>
        url === 'https://a' ? Promise.reject(new Error('提取炸了')) : Promise.resolve('正文B'),
      ) as any,
    });

    // 失败的那条保留原摘要，不被清空；成功的那条正常覆盖
    expect(result[0].content).toBe('原摘要A');
    expect(result[1].content).toBe('正文B');
  });

  test('正文提取失败不会导致策略被重新执行', async () => {
    // 防回归：提取原先在策略的 try 内，抛出会被误判成策略失败而多抓一次
    const scrape = mock(() => Promise.resolve([createMockNews()]));
    const { mgr } = makeBrowserMgr();

    await scrapeStockNews('AAPL', true, {
      strategies: [makeStrategy('RSS', scrape)],
      browserMgr: mgr,
      extractContent: mock(() => new Promise<string>(() => {})),
      budgetMs: 50,
    });

    expect(scrape).toHaveBeenCalledTimes(1);
  });

  test('预算内失败的策略仍走满两次重试', async () => {
    // 防回归：预算是给挂死用的兜底，不该顺手削掉正常的重试语义
    let attempts = 0;
    const strategies = [
      makeStrategy('Flaky', () => {
        attempts++;
        return Promise.reject(new Error('临时失败'));
      }),
    ];
    const { mgr } = makeBrowserMgr();

    await scrapeStockNews('AAPL', false, { strategies, browserMgr: mgr, budgetMs: 5_000 });

    expect(attempts).toBe(2);
  });
});
