import { expect, test, describe } from "bun:test";
import { scrapeStockNews } from "./scraper";

describe("Scraper Integration Tests", () => {
  test("US Market: AAPL (Primary Path)", async () => {
    const news = await scrapeStockNews("AAPL");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title).toBeTruthy();
  }, 60000);

  test("CN Market: 600519 (Strategy Fallback)", async () => {
    const news = await scrapeStockNews("600519");
    expect(news.length).toBeGreaterThan(0);
    const hasChinese = news.some(n => /[\u4e00-\u9fa5]/.test(n.title));
    expect(hasChinese).toBe(true);
  }, 60000);

  test("CN Market: Mixed Name and Code (688693)", async () => {
    const news = await scrapeStockNews("锴威特688693");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title).toMatch(/[\u4e00-\u9fa5]/);
  }, 60000);

  test("HK Market: 0700.HK", async () => {
    const news = await scrapeStockNews("0700.HK");
    expect(news.length).toBeGreaterThan(0);
  }, 60000);

  test("Invalid Path: Non-existent Symbol", async () => {
    const news = await scrapeStockNews("NON_EXISTENT_99999");
    expect(news.length).toBe(0);
  }, 60000);
});
