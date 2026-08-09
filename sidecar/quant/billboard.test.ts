import { describe, expect, test } from 'bun:test';
import {
  BILLBOARD_TOP_N,
  buildBillboardUrl,
  buildLatestDateUrl,
  fetchBillboard,
  parseBillboardPage,
  toTradeDate,
} from './billboard';

/** 造一页东财 datacenter 响应 */
function page(rows: Record<string, unknown>[]) {
  return { result: { data: rows } };
}

const ROW = {
  SECURITY_CODE: '000831',
  SECURITY_NAME_ABBR: '中国稀土',
  TRADE_DATE: '2026-08-07 00:00:00',
  CLOSE_PRICE: 57.19,
  CHANGE_RATE: 10.0019,
  BILLBOARD_NET_AMT: 631735592.39,
  BILLBOARD_BUY_AMT: 810284872.52,
  BILLBOARD_SELL_AMT: 178549280.13,
  ACCUM_AMOUNT: 3390463975,
  DEAL_NET_RATIO: 18.63,
  EXPLANATION: '日涨幅偏离值达到7%的前5只证券',
};

describe('toTradeDate', () => {
  test('截掉东财返回的 00:00:00 时间部分', () => {
    expect(toTradeDate('2026-08-07 00:00:00')).toBe('2026-08-07');
  });

  test('缺失日期收敛为空串，交由调用方判空', () => {
    expect(toTradeDate(null)).toBe('');
    expect(toTradeDate(undefined)).toBe('');
  });
});

describe('buildBillboardUrl', () => {
  test('必须带 TRADE_DATE 过滤——不带则该 report 默认返回 2015 年的历史数据', () => {
    const url = buildBillboardUrl('2026-08-07', true);
    expect(decodeURIComponent(url)).toContain("filter=(TRADE_DATE='2026-08-07')");
  });

  test('买入榜降序、卖出榜升序，均按净买额排序', () => {
    const buy = new URL(buildBillboardUrl('2026-08-07', true));
    const sell = new URL(buildBillboardUrl('2026-08-07', false));
    expect(buy.searchParams.get('sortColumns')).toBe('BILLBOARD_NET_AMT');
    expect(buy.searchParams.get('sortTypes')).toBe('-1');
    expect(sell.searchParams.get('sortTypes')).toBe('1');
  });

  test('默认只取 TOP_N 条', () => {
    const url = new URL(buildBillboardUrl('2026-08-07', true));
    expect(url.searchParams.get('pageSize')).toBe(String(BILLBOARD_TOP_N));
  });

  test('探日期用降序取 1 条', () => {
    const url = new URL(buildLatestDateUrl());
    expect(url.searchParams.get('sortColumns')).toBe('TRADE_DATE');
    expect(url.searchParams.get('sortTypes')).toBe('-1');
    expect(url.searchParams.get('pageSize')).toBe('1');
    // 探日期这一发不能带 filter，否则就成了「先有鸡还是先有蛋」
    expect(url.searchParams.get('filter')).toBeNull();
  });
});

describe('parseBillboardPage', () => {
  test('映射全部字段', () => {
    const [e] = parseBillboardPage(page([ROW]));
    expect(e).toEqual({
      symbol: '000831',
      name: '中国稀土',
      price: 57.19,
      changePercent: 10.0019,
      netAmount: 631735592.39,
      buyAmount: 810284872.52,
      sellAmount: 178549280.13,
      turnover: 3390463975,
      netRatio: 18.63,
      reason: '日涨幅偏离值达到7%的前5只证券',
    });
  });

  test('缺失数值收敛为 0，缺失原因收敛为空串', () => {
    const [e] = parseBillboardPage(
      page([{ SECURITY_CODE: '000001', BILLBOARD_NET_AMT: null, DEAL_NET_RATIO: '-' }]),
    );
    expect(e.netAmount).toBe(0);
    expect(e.netRatio).toBe(0);
    expect(e.reason).toBe('');
  });

  test('跳过无代码的脏行', () => {
    expect(parseBillboardPage(page([{ SECURITY_NAME_ABBR: '幽灵' }, ROW]))).toHaveLength(1);
  });

  test('响应结构异常时返回空数组而非抛错', () => {
    expect(parseBillboardPage({})).toEqual([]);
    expect(parseBillboardPage({ result: { data: null } })).toEqual([]);
    expect(parseBillboardPage({ result: null })).toEqual([]);
  });

  /**
   * 同股同日多次上榜是真实形态，且各条净额按各自统计窗口算、彼此不等。
   * 解析层**不得**去重——合并两个窗口的数字等于编一个交易所没披露过的值。
   */
  test('同股多条上榜记录全部保留，不按代码去重', () => {
    const entries = parseBillboardPage(
      page([
        {
          ...ROW,
          SECURITY_CODE: '000603',
          BILLBOARD_NET_AMT: 113039557.06,
          EXPLANATION: '连续三个交易日内，涨幅偏离值累计达到20%的证券',
        },
        {
          ...ROW,
          SECURITY_CODE: '000603',
          BILLBOARD_NET_AMT: -28864029.08,
          EXPLANATION: '日涨幅偏离值达到7%的前5只证券',
        },
      ]),
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.netAmount)).toEqual([113039557.06, -28864029.08]);
    expect(new Set(entries.map((e) => e.reason)).size).toBe(2);
  });
});

describe('fetchBillboard', () => {
  /**
   * 强制缓存未命中。**不注入就是真的会串**：缓存落在系统临时目录、跨进程存活，
   * 本机跑过一次真实 `--billboard` 之后，这些用例会直接吃到那份真数据而完全不发请求
   * （已实测踩到）。写也置空，避免单测污染真实缓存目录。
   */
  const noCache = { readCacheImpl: () => null, writeCacheImpl: () => {} };

  /** 按 URL 里的 sortTypes 分派假响应 */
  function fakeFetch(pages: { probe: unknown; buy: unknown; sell: unknown }, calls: string[] = []) {
    return (async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const body = !u.searchParams.get('filter')
        ? pages.probe
        : u.searchParams.get('sortTypes') === '-1'
          ? pages.buy
          : pages.sell;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
  }

  test('先探最新交易日，再按该日拉买卖两榜', async () => {
    const calls: string[] = [];
    const result = await fetchBillboard({
      fetchImpl: fakeFetch(
        {
          probe: page([{ TRADE_DATE: '2026-08-07 00:00:00' }]),
          buy: page([ROW]),
          sell: page([{ ...ROW, SECURITY_CODE: '002212', BILLBOARD_NET_AMT: -124955304.36 }]),
        },
        calls,
      ),
      ...noCache,
    });

    expect(result.tradeDate).toBe('2026-08-07');
    expect(result.topBuy.map((e) => e.symbol)).toEqual(['000831']);
    expect(result.topSell.map((e) => e.symbol)).toEqual(['002212']);
    // 两张榜的过滤日期都取自探到的那一天，不是各自另探
    expect(
      calls.filter((u) => decodeURIComponent(u).includes("TRADE_DATE='2026-08-07'")),
    ).toHaveLength(2);
  });

  test('探不到交易日就报错——宁可报错也不要拉回 2015 年的榜单', async () => {
    const fetchImpl = fakeFetch({ probe: page([]), buy: page([]), sell: page([]) });
    expect(fetchBillboard({ fetchImpl, ...noCache })).rejects.toThrow('交易日');
  });

  /**
   * 上榜数不足 TOP_N 时，降序页尾部会溢出成净卖出记录（升序页同理）。
   * 不按符号过滤的话「净买入榜」里会混进净卖出的股票。
   */
  test('买入榜滤掉净卖出记录，卖出榜滤掉净买入记录', async () => {
    const mixed = page([
      { ...ROW, SECURITY_CODE: '000001', BILLBOARD_NET_AMT: 500 },
      { ...ROW, SECURITY_CODE: '000002', BILLBOARD_NET_AMT: -300 },
    ]);
    const result = await fetchBillboard({
      fetchImpl: fakeFetch({
        probe: page([{ TRADE_DATE: '2026-08-07 00:00:00' }]),
        buy: mixed,
        sell: mixed,
      }),
      ...noCache,
    });

    expect(result.topBuy.map((e) => e.symbol)).toEqual(['000001']);
    expect(result.topSell.map((e) => e.symbol)).toEqual(['000002']);
  });

  test('HTTP 非 200 直接抛错，不把错误页当空榜单', async () => {
    const fetchImpl = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(fetchBillboard({ fetchImpl, ...noCache })).rejects.toThrow('503');
  });

  /**
   * 缓存存在的全部理由：这条链路是两轮串行 RTT、三发请求，打到本仓最慢的 datacenter 端点
   * （实测 2.3–8.1s，三次里超时挂一次），而面板按页签条件挂载、开关弹窗即重取。
   * 断「一发都没发」而不是「快了」——后者在 CI 上量不准。
   */
  test('缓存命中时一发请求都不发', async () => {
    const calls: string[] = [];
    const cached = { tradeDate: '2026-08-07', topBuy: [], topSell: [], fetchedAt: 1 };
    const result = await fetchBillboard({
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      readCacheImpl: () => cached as never,
      writeCacheImpl: () => {},
    });

    expect(result).toEqual(cached);
    expect(calls).toHaveLength(0);
  });

  /**
   * 空榜多半是上游抽风而非「今天没人上榜」（实测该端点会超时失败）。
   * 缓存下来等于把一次偶发失败固化成半小时的空榜，且用户没有重试入口。
   */
  test('两榜皆空时不写缓存，下次仍会重试', async () => {
    const written: unknown[] = [];
    const result = await fetchBillboard({
      fetchImpl: fakeFetch({
        probe: page([{ TRADE_DATE: '2026-08-07 00:00:00' }]),
        buy: page([]),
        sell: page([]),
      }),
      readCacheImpl: () => null,
      writeCacheImpl: ((_k: string, v: unknown) => {
        written.push(v);
      }) as never,
    });

    expect(result.tradeDate).toBe('2026-08-07'); // 照常返回，不抛错
    expect(written).toHaveLength(0);
  });
});
