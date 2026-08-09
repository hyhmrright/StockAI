import { expect, test, describe } from 'bun:test';
import { parseGoogleNews, parseYahooNews, extractExternalLinks, extractDomain } from './html';

describe('Scraper Parsers (Unit)', () => {
  test('parseGoogleNews 应该能从 HTML 字符串中提取新闻', async () => {
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
    expect(news[0].source).toBe('CNBC');
    expect(news[0].title).toBe('Apple stocks soar after record earnings');
    expect(news[0].url).toBe('https://www.google.com/news/article1');
    expect(news[1].source).toBe('Reuters');
  });

  test('parseYahooNews 应该能从 HTML 字符串中提取新闻', async () => {
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
    expect(news[0].title).toContain('Tesla announces major update');
    expect(news[0].source).toBe('Yahoo Finance');
    expect(news[0].url).toBe('https://finance.yahoo.com/news/tesla-auto-pilot-update');
  });

  test('parseGoogleNews: 畸形 HTML 不应崩溃，返回数组', async () => {
    const malformed = `<html><body><a href="/news<div>broken</a></div><a><span>`;
    const news = await parseGoogleNews(malformed);
    expect(news).toBeArray();
  });

  test('parseYahooNews: 畸形 HTML 不应崩溃，返回数组', async () => {
    const malformed = `<html><body><a href="/news<div>broken</a></div><a><span>`;
    const news = await parseYahooNews(malformed);
    expect(news).toBeArray();
  });

  test('parseGoogleNews: 空字符串不应崩溃，返回空数组', async () => {
    const news = await parseGoogleNews('');
    expect(news.length).toBe(0);
  });

  test('parseYahooNews: 空字符串不应崩溃，返回空数组', async () => {
    const news = await parseYahooNews('');
    expect(news.length).toBe(0);
  });

  test('当没有匹配链接时应返回空列表', async () => {
    const mockHtml = `<html><body><div>No news here</div></body></html>`;
    const googleNews = await parseGoogleNews(mockHtml);
    const yahooNews = await parseYahooNews(mockHtml);

    expect(googleNews.length).toBe(0);
    expect(yahooNews.length).toBe(0);
  });
});

describe('extractExternalLinks', () => {
  test('提取直接外链并按首次出现顺序去重', () => {
    const html =
      '<a href="https://a.com/1">x</a><a href="https://a.com/1">重复</a><a href="http://b.com">z</a>';
    expect(extractExternalLinks(html)).toEqual(['https://a.com/1', 'http://b.com']);
  });

  /** Google 结果页里外链裹在 /url?q= 跳转里，取不出来等于整页颗粒无收 */
  test('还原 /url?q= 跳转里的真实地址并 decode', () => {
    const html = '<a href="/url?q=https://news.example.com/a%2Db&sa=U&ved=xyz">x</a>';
    expect(extractExternalLinks(html)).toEqual(['https://news.example.com/a-b']);
  });

  test('过滤掉 google.com 自家链接', () => {
    const html = '<a href="https://www.google.com/search?q=x">g</a><a href="https://c.com">c</a>';
    expect(extractExternalLinks(html)).toEqual(['https://c.com']);
  });

  test('没有链接时返回空数组而不是抛', () => {
    expect(extractExternalLinks('<p>纯文本</p>')).toEqual([]);
  });
});

describe('extractDomain', () => {
  test('取 hostname 并去掉 www. 前缀', () => {
    expect(extractDomain('https://www.reuters.com/markets/a')).toBe('reuters.com');
    expect(extractDomain('http://finance.sina.com.cn/x?a=1')).toBe('finance.sina.com.cn');
  });

  test('非法 URL 原样返回——新闻来源标签宁可显示原串也不该整条崩掉', () => {
    expect(extractDomain('不是链接')).toBe('不是链接');
  });
});
