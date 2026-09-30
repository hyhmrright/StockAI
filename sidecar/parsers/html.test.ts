import { expect, test, describe } from 'bun:test';
import { parseGoogleNews, parseYahooNews, parseGoogleNewsSearch, extractDomain } from './html';

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

describe('parseGoogleNewsSearch', () => {
  /** 新版结果页：整张卡片是一个外链 <a>，标题在其中的 role="heading" 里 */
  test('新版结果页：标题取自同一链接内的 heading，google.com 自家链接被排除', async () => {
    const html = `
      <a href="https://www.google.com/search?q=AAPL&tbm=nws&start=10"><div role="heading">Next page of results here</div></a>
      <a href="https://www.cnbc.com/2026/09/30/apple.html">
        <div>CNBC</div>
        <div role="heading" aria-level="3">Apple shares climb after
          iPhone launch</div>
        <div>Apple Inc. (AAPL) rose 3% on Tuesday...</div>
        <span>2 hours ago</span>
      </a>`;
    const news = await parseGoogleNewsSearch(html, 'AAPL');
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({
      title: 'Apple shares climb after iPhone launch',
      source: 'cnbc.com',
      url: 'https://www.cnbc.com/2026/09/30/apple.html',
    });
  });

  /** 基础版结果页：外链裹在 /url?q= 跳转里，取不出来等于整页颗粒无收 */
  test('基础版结果页：还原 /url?q= 跳转并取 .vvjwJb 标题', async () => {
    const html = `
      <a href="/url?q=https://news.example.com/a%2Db&amp;sa=U&amp;ved=xyz">
        <div class="BNeawe vvjwJb AP7Wnd">腾讯控股(00700)回购股份</div>
        <div class="BNeawe UPmit AP7Wnd">example.com</div>
      </a>`;
    const news = await parseGoogleNewsSearch(html, '0700.HK');
    expect(news.map((n) => n.url)).toEqual(['https://news.example.com/a-b']);
    expect(news[0].title).toBe('腾讯控股(00700)回购股份');
  });

  /**
   * 数据源冒烟 run 36731049524 的回归：无结果页上的零星外链（资源、页脚、推广）
   * 曾被配上 "<symbol> 相关新闻 1" 的占位标题当成新闻，让「查无此股」提示失效。
   */
  test('无结果页：没有标题的外链不得被伪造成占位新闻', async () => {
    const html = `
      <html><head><link rel="preconnect" href="https://fonts.gstatic.com"></head><body>
        <div>Your search - "NON_EXISTENT_99999" stock news - did not match any news results.</div>
        <a href="https://www.google.com/search?q=NON_EXISTENT_99999">Search the web instead</a>
        <a href="https://about.google/?utm_source=NON_EXISTENT_99999">About</a>
        <a href="https://www.youtube.com/">YouTube for NON_EXISTENT_99999 and more videos</a>
      </body></html>`;
    expect(await parseGoogleNewsSearch(html, 'NON_EXISTENT_99999')).toEqual([]);
  });

  /** Google 对引号查询也会放宽匹配，返回与标的毫不相干的"结果" */
  test('链接文本里没有标的词元的结果按无关丢弃', async () => {
    const html = `
      <a href="https://www.reuters.com/markets/stocks">
        <div role="heading">Stocks rally as Fed signals rate cuts ahead</div>
        <div>Wall Street closed higher on Wednesday...</div>
      </a>`;
    expect(await parseGoogleNewsSearch(html, 'NON_EXISTENT_99999')).toEqual([]);
  });

  test('同一 URL 只保留一条', async () => {
    const card = `<a href="https://a.com/1"><div role="heading">AAPL earnings beat estimates</div></a>`;
    expect(await parseGoogleNewsSearch(card + card, 'AAPL')).toHaveLength(1);
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
