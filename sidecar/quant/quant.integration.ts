import { describe, expect, it } from 'bun:test';
import { fetchFinancialHistory } from './fundamental-history';
import { fetchFundamentals } from './fundamental';
import { fetchFundFlow } from './fundflow';
import { fetchMarketSnapshot } from './market-snapshot';
import { fetchSectorBoards } from './sectors';
import { fetchBillboard } from './billboard';
import { fetchCompanyF10 } from './company-f10';

/**
 * 量化数据源的真网络冒烟——只跑 `bun run test:integration`，默认套件不含。
 *
 * **本组最关键的断言是「结果非空」**，因为这一层的容错设计把失败伪装成了成功：
 * `fetchFundamentals` 抓取异常 → 返回 `{}`；`fetchFundFlow` 异常 → 返回 `null`。
 * 生产上这是对的（走 `Promise.allSettled`，单源挂掉不该拖垮整个量化评分），但代价是
 * **数据源死了没有任何人会知道**——量化分只是静默降级。只查「没抛异常」的测试
 * 在这里毫无价值，必须查内容。
 *
 * 带磁盘缓存的源一律注入空缓存强制走网络，否则命中缓存就等于没测上游——
 * 这条 CI 任务每天跑，缓存一命中它就变成「永远绿的空断言」，正是本仓最防的那种失明。
 * 写缓存同时置空，避免冒烟污染真实缓存目录。
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

  it('东财板块涨幅榜——行业与概念各一张', async () => {
    const boards = await fetchSectorBoards(noCache);

    // 非空是必断项：漏掉 np=1 时 diff 会退化成对象，parseSectorPage 静默返回空表，
    // 只断「没抛异常」等于完全没监控这条链路。
    for (const list of [boards.industry, boards.concept]) {
      expect(list.length).toBeGreaterThan(0);
      const s = list[0];
      expect(s.code).toMatch(/^BK\d+$/); // 板块代码形如 BK0899
      expect(s.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.changePercent)).toBe(true);
      expect(Number.isFinite(s.mainNetInflow)).toBe(true);
    }

    // 行业与概念必须是两份不同的榜单——fs 过滤写错会让两边拉回同一张
    expect(boards.industry[0].code).not.toBe(boards.concept[0].code);
  });

  it('东财龙虎榜——最新交易日的买卖两榜', async () => {
    const board = await fetchBillboard(noCache);

    // 交易日必须是「最近」的：该 report 是全历史表（约 8.8 万页），
    // 少了 TRADE_DATE 过滤会静默拉回 2015 年的榜单——形状完全合法，只是过期十年。
    // 放宽到 30 天是为容纳长假；这条正是本模块要防的那个坑的哨兵。
    expect(board.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ageDays = (Date.now() - Date.parse(board.tradeDate)) / 86_400_000;
    expect(ageDays).toBeLessThan(30);

    // 非空是必断项：单边为空还说得过去（极端单边行情），两边同时空只可能是链路挂了
    expect(board.topBuy.length + board.topSell.length).toBeGreaterThan(0);

    for (const e of [...board.topBuy, ...board.topSell]) {
      expect(e.symbol).toMatch(/^\d{6}$/);
      expect(e.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(e.netAmount)).toBe(true);
      expect(e.reason.length).toBeGreaterThan(0); // 上榜原因必须有，否则数字没法解读
    }

    // 两榜的符号方向：混进反向记录说明按符号过滤失效了
    expect(board.topBuy.every((e) => e.netAmount > 0)).toBe(true);
    expect(board.topSell.every((e) => e.netAmount < 0)).toBe(true);
  });

  it('东财 F10 公司资料（A 股）——四块并发，逐块断形状', async () => {
    const f10 = await fetchCompanyF10(CN_SYMBOL, 'SH600519', noCache);

    // 四块是 allSettled 并发、单块失败会静默降级为 undefined，
    // 所以每一块都得单独断——只断「没抛异常」时，三块挂掉也照样绿。
    expect(f10.name.length).toBeGreaterThan(0);
    expect(f10.overview?.fullName.length).toBeGreaterThan(0);
    expect(f10.overview?.industry.length).toBeGreaterThan(0);

    expect(f10.segments.length).toBeGreaterThan(0);
    expect(f10.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 占比是 0..1 的小数（东财 MBI_RATIO 口径）；若上游改成百分数会在这里炸
    expect(f10.segments.every((s) => s.revenueRatio >= 0 && s.revenueRatio <= 1)).toBe(true);
    // 只取最新一期：多期混排会让同一 dimension 出现远超实际的条目数
    expect(new Set(f10.segments.map((s) => s.dimension)).size).toBeLessThanOrEqual(3);

    expect(f10.shareholding?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(f10.shareholding?.topHolders.length).toBeGreaterThan(0);
    expect(f10.shareholding?.topHolders[0].name.length).toBeGreaterThan(0);

    expect(f10.boards.length).toBeGreaterThan(0);
  });
});
