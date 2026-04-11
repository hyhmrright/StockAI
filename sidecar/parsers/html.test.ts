import { expect, test, describe } from "bun:test";
import { parseGoogleNews, parseYahooNews } from "./html";

describe("Scraper Parsers (Unit)", () => {
  
  test("parseGoogleNews 应该能从 HTML 字符串中提取新闻", async () => {
    const mockHtml = `
      <html>
        <body>
          <a href="/news/article1">
            <div>CNBC</div>
            <div>Apple stocks soar after record earnings</div>
            <div>2 hours ago</div>
          </a>
          <a href="/news/article2">
            <div>Reuters</div>
            <div>iPhone sales slow down in global market</div>
            <div>5 hours ago</div>
          </a>
        </body>
      </html>
    `;
    
    const news = await parseGoogleNews(mockHtml);
    
    expect(news.length).toBe(2);
    expect(news[0].source).toBe("CNBC");
    expect(news[0].title).toBe("Apple stocks soar after record earnings");
    expect(news[0].url).toBe("https://www.google.com/news/article1");
    expect(news[1].source).toBe("Reuters");
  });

  test("parseYahooNews 应该能从 HTML 字符串中提取新闻", async () => {
    const mockHtml = `
      <html>
        <body>
          <div id="quoteNewsStreamContent">
            <a href="https://finance.yahoo.com/news/tesla-auto-pilot-update">
              Tesla announces major update to autopilot system
            </a>
          </div>
        </body>
      </html>
    `;
    
    const news = await parseYahooNews(mockHtml);
    
    expect(news.length).toBe(1);
    expect(news[0].title).toContain("Tesla announces major update");
    expect(news[0].source).toBe("Yahoo Finance");
    expect(news[0].url).toBe("https://finance.yahoo.com/news/tesla-auto-pilot-update");
  });

  test("parseGoogleNews: 畸形 HTML 不应崩溃，返回数组", async () => {
    const malformed = `<html><body><a href="/news<div>broken</a></div><a><span>`;
    const news = await parseGoogleNews(malformed);
    expect(news).toBeArray();
  });

  test("parseYahooNews: 畸形 HTML 不应崩溃，返回数组", async () => {
    const malformed = `<html><body><a href="/news<div>broken</a></div><a><span>`;
    const news = await parseYahooNews(malformed);
    expect(news).toBeArray();
  });

  test("parseGoogleNews: 空字符串不应崩溃，返回空数组", async () => {
    const news = await parseGoogleNews("");
    expect(news.length).toBe(0);
  });

  test("parseYahooNews: 空字符串不应崩溃，返回空数组", async () => {
    const news = await parseYahooNews("");
    expect(news.length).toBe(0);
  });

  test("当没有匹配链接时应返回空列表", async () => {
    const mockHtml = `<html><body><div>No news here</div></body></html>`;
    const googleNews = await parseGoogleNews(mockHtml);
    const yahooNews = await parseYahooNews(mockHtml);
    
    expect(googleNews.length).toBe(0);
    expect(yahooNews.length).toBe(0);
  });
});
