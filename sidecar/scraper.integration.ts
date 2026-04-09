import { expect, test, describe } from "bun:test";
import { scrapeStockNews } from "./scraper";
import { logger } from "./utils";

describe("Scraper Integration Tests", () => {
  test("全流程新闻抓取: AAPL (美股主路径)", async () => {
    logger.info("正在执行集成测试: 抓取 AAPL 新闻...");
    const news = await scrapeStockNews("AAPL");
    
    // 验证核心字段是否存在
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title).toBeTruthy();
    expect(news[0].url).toContain("http");
    expect(news[0].source).toBeTruthy();
  }, 60000);

  test("异常路径: 处理不存在或非法的股票代码", async () => {
    logger.info("正在执行集成测试: 非法股票代码抓取...");
    const news = await scrapeStockNews("INVALID_SYMBOL_12345");
    expect(news.length).toBe(0);
  }, 60000);

  /**
   * 策略退避逻辑验证 (集成)
   * A 股由于其特殊性，通常会触发 Google News 搜索回退
   */
  test("策略回退验证: A 股 (600519)", async () => {
    logger.info("正在验证策略回退: 抓取 茅台(600519) 新闻...");
    const news = await scrapeStockNews("600519");
    
    expect(news.length).toBeGreaterThan(0);
    // 验证抓取到的内容是否包含中文（Google News Search zh-CN 结果）
    const hasChinese = news.some(n => /[\u4e00-\u9fa5]/.test(n.title));
    expect(hasChinese).toBe(true);
  }, 60000);
});
