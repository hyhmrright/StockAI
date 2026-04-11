import type { StockNews } from '../types';
import { todayISO } from '../utils';
import { ScrapeStrategy } from './base';
import { parseSymbol } from '../parsers/exchange';
import { Page } from 'playwright-core';

/**
 * Google News RSS 抓取策略。
 * RSS 不需要 JavaScript，不触发 reCAPTCHA，适合 A 股中文关键词搜索。
 */
export class GoogleNewsRSSStrategy extends ScrapeStrategy {
  name = "Google News RSS";

  /** 
   * 获取目标 URL（RSS 策略不使用此方法，由 parse 覆盖）
   */
  protected getUrl(_symbol: string): string {
    return '';
  }

  /**
   * RSS 策略重写 scrape 方法，直接使用 fetch 而非 Playwright
   */
  async scrape(_page: Page, symbol: string): Promise<StockNews[]> {
    const parsed = parseSymbol(symbol);
    const query = parsed.displayName
      ? `"${parsed.displayName}" 股票`
      : `${parsed.chinaInfo?.code || symbol} 股票`;

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;

    try {
      const resp = await fetch(url);
      const xml = await resp.text();
      return this.parse(xml);
    } catch (err) {
      return [];
    }
  }

  /**
   * 解析 RSS XML 字符串
   */
  protected parse(xml: string): StockNews[] {
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

    return items.slice(0, 8).map(item => {
      const rawTitle = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                    ?? item.match(/<title>(.*?)<\/title>/)?.[1]
                    ?? '';
      const title = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim();

      const link = item.match(/<link>\s*(.*?)\s*<\/link>/)?.[1] ?? '';
      const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';

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
}

