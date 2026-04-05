import { expect, test, describe } from "bun:test";
import { scrapeStockNews } from "./scraper";

describe("Scraper Tests", () => {
  test("应该能抓取 AAPL 的新闻", async () => {
    console.log("正在抓取 AAPL 的新闻...");
    const news = await scrapeStockNews("AAPL");
    console.log(`抓取到 ${news.length} 条 AAPL 新闻:`);
    news.forEach((n, i) => console.log(`  ${i+1}. [${n.source}] ${n.title}`));
    
    // 只要能抓取到，哪怕是 1 条也算成功
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title).toBeTruthy();
    expect(news[0].url).toContain("http");
  }, 60000); // 增加超时时间，Playwright 启动和网络请求可能较慢

  test("处理不存在的股票代码时应返回空列表", async () => {
    console.log("测试不存在的股票代码...");
    const news = await scrapeStockNews("NONEXISTENT_STOCK_CODE_XYZ");
    expect(news.length).toBe(0);
  }, 60000);
});
