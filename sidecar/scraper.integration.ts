import { afterAll, expect, test, describe } from 'bun:test';
import { scrapeStockNews } from './scraper';
import { BrowserManager } from './browser-manager';
import { EastmoneyNewsStrategy } from './strategies/eastmoney-news';
import { GoogleNewsSearchStrategy } from './strategies/google-news';
import { warnUnverified } from './smoke-helpers';

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

/**
 * 东财资讯必须**直接打策略**，不能经 scrapeStockNews。
 *
 * 理由是这条链首个成功即返回：CI 在美国节点上跑，Google News RSS 永远先命中，
 * 东财一次都轮不到。而它恰恰是唯一不依赖 google/yahoo 域名的源——Google 可达时它形同
 * 不存在，正是"上游改版了也永远绿"的结构性失明。走链路测等于没测。
 */
describe('EastmoneyNewsStrategy Integration (唯一的非 Google/Yahoo 新闻源)', () => {
  const strategy = new EastmoneyNewsStrategy();
  const noBrowser = {
    getPage: () => Promise.reject(new Error('纯 fetch 策略不应启动浏览器')),
  };

  test(
    'A 股：贵州茅台600519 返回非空且形状正确',
    async () => {
      const news = await strategy.scrape('贵州茅台600519', noBrowser);

      expect(news.length).toBeGreaterThan(0);
      expect(news[0].title).toBeTruthy();
      expect(news[0].url).toContain('eastmoney.com');
      expect(news[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 摘要落在 content 里，深度模式抓不到全文时它就是唯一的正文来源
      expect(news[0].content).toBeTruthy();
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    'A 股纯代码（增强失败时的形态）同样非空',
    async () => {
      // getEnhancedSymbol 依赖 stock-info，它挂掉时关键词退化为裸代码——
      // 这条钉住"退化路径也能出结果"
      const news = await strategy.scrape('300866', noBrowser);
      expect(news.length).toBeGreaterThan(0);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    '美股：AAPL 返回非空',
    async () => {
      const news = await strategy.scrape('AAPL', noBrowser);
      expect(news.length).toBeGreaterThan(0);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    '港股：0700.HK 返回非空——港股此前只有 Google 一条命',
    async () => {
      // 港股解析分支补齐前，关键词退化成整串 "0700.HK"，东财召回的几乎全是别家港股的
      // 公告、被相关性过滤清空；港股新闻于是只剩 Google 一条链，Google 不可达即全空。
      const news = await strategy.scrape('0700.HK', noBrowser);
      expect(news.length).toBeGreaterThan(0);
      expect(news[0].url).toContain('eastmoney.com');
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    '新闻足够新——过期十年的形状同样合法，只有日期能拆穿',
    async () => {
      const news = await strategy.scrape('贵州茅台600519', noBrowser);
      const newest = news.map((n) => Date.parse(n.date)).sort((a, b) => b - a)[0];
      const daysAgo = (Date.now() - newest) / 86_400_000;

      expect(daysAgo).toBeLessThan(30);
    },
    INTEGRATION_TEST_TIMEOUT,
  );

  test(
    '无效代码返回 0 条——全文子串匹配不得伪造出"有新闻"',
    async () => {
      // 东财搜索是全文匹配，'NON_EXISTENT_99999' 实测靠正文里的 "99999" 命中 2 条无关新闻。
      // 相关性过滤必须把它们挡掉，否则 fetchMarketBundle 的"查无此股"提示就失效了。
      const news = await strategy.scrape('NON_EXISTENT_99999', noBrowser);
      expect(news.length).toBe(0);
    },
    INTEGRATION_TEST_TIMEOUT,
  );
});

/**
 * Google News Search 同样必须**直接打策略**：链路上 RSS 永远先命中，它只在无效代码那条
 * 用例里才轮得到——而那条断的是「0 条」，解析器被 Google 改版弄瞎时也照样是 0 条。
 * 没有这组正向断言，「真结果页还能解析出新闻」就是结构性失明。
 *
 * CI 出口 IP 常被 Google 重定向到 /sorry/ 验证码页：**验证码 = 未验证，不是失败**
 * （同 smoke-helpers 的取舍）。判据看落地 URL 而非结果条数——空结果既可能是验证码，
 * 也可能是解析器瞎了，只有后者该判红。
 */
describe('GoogleNewsSearchStrategy Integration (真结果页的解析契约)', () => {
  const browserMgr = new BrowserManager();
  afterAll(() => browserMgr.close());

  const strategy = new GoogleNewsSearchStrategy();
  // 关键词沿用链路上游增强后的形态（名称 + 代码），与生产调用一致
  const cases = [
    { symbol: 'AAPL', label: '美股' },
    { symbol: '贵州茅台600519', label: 'A 股（zh-CN 查询分支）' },
  ];

  for (const { symbol, label } of cases) {
    test(
      `${label}：${symbol} 返回带真实标题的外链新闻；遇验证码跳过`,
      async () => {
        const news = await strategy.scrape(symbol, browserMgr);
        const landedUrl = (await browserMgr.getPage()).url();
        if (landedUrl.includes('/sorry/')) {
          warnUnverified(`Google News Search (${symbol})`, '被重定向到验证码页');
          return;
        }

        expect(news.length).toBeGreaterThan(0);
        for (const n of news) {
          expect(n.title.length).toBeGreaterThanOrEqual(10);
          expect(n.url).toMatch(/^https?:\/\//);
          expect(n.url).not.toContain('google.com');
        }
      },
      INTEGRATION_TEST_TIMEOUT,
    );
  }
});
