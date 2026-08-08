import { describe, expect, it } from 'bun:test';
import { fetchFinancialHistory } from './fundamental-history';
import { fetchFundamentals } from './fundamental';
import { fetchFundFlow } from './fundflow';
import { fetchMarketSnapshot } from './market-snapshot';

/**
 * 量化数据源的真网络冒烟——只跑 `bun run test:integration`，默认套件不含。
 *
 * **本组最关键的断言是「结果非空」**，因为这一层的容错设计把失败伪装成了成功：
 * `fetchFundamentals` 抓取异常 → 返回 `{}`；`fetchFundFlow` 异常 → 返回 `null`。
 * 生产上这是对的（走 `Promise.allSettled`，单源挂掉不该拖垮整个量化评分），但代价是
 * **数据源死了没有任何人会知道**——量化分只是静默降级。只查「没抛异常」的测试
 * 在这里毫无价值，必须查内容。
 *
 * 带 24h 磁盘缓存的两个源（财报历史、全市场快照）注入空缓存强制走网络，
 * 否则命中缓存就等于没测上游。写缓存同时置空，避免冒烟污染真实缓存目录。
 */

const CN_SYMBOL = '600519'; // 贵州茅台
const US_SYMBOL = 'AAPL';

/** 强制缓存未命中让请求真的打到上游；写也置空，避免冒烟污染真实缓存目录 */
const noCache = {
  readCacheImpl: () => null,
  writeCacheImpl: () => {},
};

describe('量化数据源（真网络）', () => {
  it('东财财务指标（A 股）——失败会被吞成 {}，故断言非空', async () => {
    const metrics = await fetchFundamentals(CN_SYMBOL, 'A股');
    expect(Object.keys(metrics).length).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.roe)).toBe(true);
  });

  it('Yahoo 财务指标（美股）——同上，{} 即为失效信号', async () => {
    const metrics = await fetchFundamentals(US_SYMBOL, '美股');
    expect(Object.keys(metrics).length).toBeGreaterThan(0);
  });

  it('东财资金流（A 股）——失败会被吞成 null，故断言非 null', async () => {
    const flow = await fetchFundFlow(CN_SYMBOL);
    expect(flow).not.toBeNull();
    expect(flow?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(flow?.mainNet)).toBe(true);
  });

  it('东财财报历史（A 股）', async () => {
    const history = await fetchFinancialHistory(CN_SYMBOL, 4, noCache);
    expect(history.snapshots.length).toBeGreaterThan(0);
    expect(history.snapshots[0].reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('东财全市场快照——分页聚合，条数远超单页即证明翻页仍有效', async () => {
    const snapshot = await fetchMarketSnapshot(noCache);
    // 单页 100 条；A 股全市场约 5900 只。拿到 >1000 条说明分页累加没断，
    // 只断 >0 会让「翻页坏了、只剩第一页」这种退化蒙混过关。
    expect(snapshot.entries.length).toBeGreaterThan(1000);
    expect(snapshot.entries[0].symbol).toMatch(/^\d{6}$/);
  }, 60_000); // 分页串行 + 页间抖动，实测约 20s
});
