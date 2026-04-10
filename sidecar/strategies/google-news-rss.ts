import type { StockNews } from '../types';
import { todayISO } from '../utils';

/**
 * 从 Google News RSS 获取新闻列表。
 * RSS 不需要 JavaScript，不触发 reCAPTCHA，适合 A 股中文关键词搜索。
 */
export async function fetchGoogleNewsRSS(query: string): Promise<StockNews[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;

  const resp = await fetch(url);
  const xml = await resp.text();

  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  return items.slice(0, 8).map(item => {
    // title 格式：新闻标题 - 来源名，去掉尾部的 " - 来源名"
    const rawTitle = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                  ?? item.match(/<title>(.*?)<\/title>/)?.[1]
                  ?? '';
    const title = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim();

    const link = item.match(/<link>\s*(.*?)\s*<\/link>/)?.[1] ?? '';
    const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

    // 将 RFC 2822 日期转为 YYYY-MM-DD，解析失败保留今日日期
    let date = todayISO();
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0];
      }
    }

    return { title, url: link, source, date, content: '' };
  }).filter(n => n.title && n.url);
}
