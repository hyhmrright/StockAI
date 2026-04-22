import { describe, it, expect } from 'bun:test';
import { GoogleNewsRSSStrategy } from './google-news-rss';

describe('GoogleNewsRSSStrategy', () => {
  it('应该在 fetch 成功时解析 XML', async () => {
    const mockXml = '<rss><item><title>Test News</title><link>https://test.com</link></item></rss>';
    const mockFetch = async (_url: string) =>
      ({ ok: true, text: async () => mockXml }) as Response;

    const strategy = new GoogleNewsRSSStrategy(mockFetch as typeof fetch);
    const results = await strategy.scrape('601012', {} as any);

    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Test News');
  });

  it('应该在 fetch 失败 (resp.ok === false) 时返回空列表', async () => {
    const mockFetch = async (_url: string) =>
      ({ ok: false, status: 404 }) as Response;

    const strategy = new GoogleNewsRSSStrategy(mockFetch as typeof fetch);
    const results = await strategy.scrape('601012', {} as any);

    expect(results).toEqual([]);
  });

  it('应该在 fetch 抛出异常时返回空列表', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      throw new Error('Network Error');
    };

    const strategy = new GoogleNewsRSSStrategy(mockFetch as typeof fetch);
    const results = await strategy.scrape('601012', {} as any);

    expect(results).toEqual([]);
  });
});
