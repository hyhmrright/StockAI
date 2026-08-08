import { describe, expect, it } from 'bun:test';
import { searchStocks } from './search';

/**
 * 真网络集成测试——只跑 `bun run test:integration`，不进默认单测套件。
 *
 * 新浪 suggest + hq 两段串行请求耗时 2–8s 且会限流，放进默认套件会周期性假红。
 * 解析逻辑的断言在 search.test.ts（离线 fixture）；这里只回答一个问题：
 * 「新浪接口的响应形态是否还和我们的解析假设一致」。
 */
describe('searchStocks（真网络）', () => {
  it('应能搜索 A 股 (601012)', async () => {
    const results = await searchStocks('601012');
    expect(results.length).toBeGreaterThan(0);
    const item = results.find((r) => r.code === '601012');
    expect(item).toBeDefined();
    expect(item?.fullCode).toBe('sh601012');
    expect(item?.type).toBe('A股');
    expect(typeof item?.price).toBe('number');
  });

  it('应能搜索美股 (AAPL)', async () => {
    const results = await searchStocks('AAPL');
    expect(results.length).toBeGreaterThan(0);
    const item = results.find((r) => r.code === 'AAPL');
    expect(item).toBeDefined();
    expect(item?.fullCode).toBe('gb_aapl');
    expect(item?.type).toBe('美股');
    expect(typeof item?.price).toBe('number');
  });
});
