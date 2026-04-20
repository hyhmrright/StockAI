import { describe, expect, it } from 'bun:test';
import { searchStocks } from './search';

describe('searchStocks', () => {
  it('应能搜索 A 股 (601012)', async () => {
    const results = await searchStocks('601012');
    expect(results.length).toBeGreaterThan(0);
    const item = results.find(r => r.code === '601012');
    expect(item).toBeDefined();
    expect(item?.fullCode).toBe('sh601012');
    expect(item?.type).toBe('A股');
  });

  it('应能搜索美股 (AAPL)', async () => {
    const results = await searchStocks('AAPL');
    expect(results.length).toBeGreaterThan(0);
    const item = results.find(r => r.code === 'AAPL');
    expect(item).toBeDefined();
    expect(item?.fullCode).toBe('gb_aapl');
    expect(item?.type).toBe('美股');
  });

  it('搜索短词应返回空数组', async () => {
    const results = await searchStocks('A');
    expect(results.length).toBe(0);
  });
});
