import { expect, test, describe } from 'bun:test';
import { scrapeStockNews } from './scraper';

// 75s：scrapeStockNews 整体已被 TIMEOUTS.scrapeBudget（60s）兜底——策略链与正文提取共享
// 这份预算，只有 browserMgr.close() 在预算之外，留 15s 足够。**不要再往上调**——这条超时
// 是「一次抓取有界」这个不变量的哨兵，调高等于把哨兵拆了。上一次它就是这么抓到正文提取
// 逃在预算外的：600519 与 0700.HK 卡满 90s，正是 60s 策略链 + 3×10s 正文提取。
const INTEGRATION_TEST_TIMEOUT = 75_000;

describe('Scraper Integration Tests', () => {
  test(
    'US Market: AAPL (Primary Path)',
    async () => {
      const news = await scrapeStockNews('AAPL');
      expect(news.length).toBeGreaterThan(0);
      expect(news[0].title).toBeTruthy();
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    'CN Market: 600519 (Strategy Fallback)',
    async () => {
      const news = await scrapeStockNews('600519');
      expect(news.length).toBeGreaterThan(0);
      const hasChinese = news.some((n) => /[\u4e00-\u9fa5]/.test(n.title));
      expect(hasChinese).toBe(true);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    'CN Market: Mixed Name and Code (688693)',
    async () => {
      const news = await scrapeStockNews('锴威特688693');
      expect(news.length).toBeGreaterThan(0);
      expect(news[0].title).toMatch(/[\u4e00-\u9fa5]/);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    'HK Market: 0700.HK',
    async () => {
      const news = await scrapeStockNews('0700.HK');
      expect(news.length).toBeGreaterThan(0);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    'Invalid Path: Non-existent Symbol',
    async () => {
      const news = await scrapeStockNews('NON_EXISTENT_99999');
      expect(news.length).toBe(0);
    },
    INTEGRATION_TEST_TIMEOUT,
  );
});
