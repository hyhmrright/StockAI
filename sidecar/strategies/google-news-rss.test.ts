import { describe, it, expect } from 'bun:test';
import { GoogleNewsRSSStrategy } from './google-news-rss';

describe('GoogleNewsRSSStrategy', () => {
  it('应该在 fetch 成功时解析 XML', async () => {
    const mockXml = '<rss><item><title>Test News</title><link>https://test.com</link></item></rss>';
    const mockFetch = async (_url: string) => ({ ok: true, text: async () => mockXml }) as Response;

    const strategy = new GoogleNewsRSSStrategy(mockFetch as typeof fetch);
    const results = await strategy.scrape('601012', {} as any);

    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Test News');
  });

  it('应该在 fetch 失败 (resp.ok === false) 时返回空列表', async () => {
    const mockFetch = async (_url: string) => ({ ok: false, status: 404 }) as Response;

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

  it('走 fetchWithPolicy：请求必须带中止信号', async () => {
    // 防回归：此前用裸 globalThis.fetch，**完全没有超时**。news.google.com 在部分地区
    // 不可达，裸 fetch 会挂到操作系统 TCP 超时（70s+），吃光 scrapeBudget 的 60s 预算——
    // 后面的国内备源策略于是一次都跑不到，用户看到的就是"没有找到相关新闻"。
    let seen: RequestInit | undefined;
    const mockFetch = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return { ok: true, text: async () => '<rss></rss>' } as Response;
    }) as unknown as typeof fetch;

    await new GoogleNewsRSSStrategy(mockFetch).scrape('601012', {} as any);

    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });
});
