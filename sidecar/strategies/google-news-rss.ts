import type { StockNews } from '../../shared/types';
import { todayISO, toErrorMessage, logger } from '../utils';
import type { ScrapeContext, ScrapeStrategy } from './base';
import { parseSymbol } from '../parsers/exchange';

/**
 * Google News RSS 抓取策略。
 * 纯 fetch 实现——不需要 Playwright，不触发 reCAPTCHA，适合 A 股中文关键词搜索。
 * 不调用 ctx.getPage()，所以 RSS-only 命中路径不会启动 Chromium。
 */
export class GoogleNewsRSSStrategy implements ScrapeStrategy {
  readonly name = "Google News RSS";

  async scrape(symbol: string, _ctx: ScrapeContext): Promise<StockNews[]> {
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
      logger.warn(`[${this.name}] RSS 抓取失败 (${symbol}): ${toErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * 解析 RSS XML 字符串
   */
  private parse(xml: string): StockNews[] {
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
