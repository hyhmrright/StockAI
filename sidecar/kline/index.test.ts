import { describe, test, expect } from 'bun:test';
import { getKline, getQuote } from './index';

/**
 * 多源回退编排的离线测试——KlineSourceDeps.fetchImpl 是唯一注入点，
 * 让「腾讯失败 → 东财接手」这条容错逻辑不再需要真网络才能验证。
 */

/** 腾讯日 K 的最小合法响应 */
function tencentKlineBody(close: string) {
  return JSON.stringify({
    code: 0,
    data: {
      sh600519: { qfqday: [['2024-12-30', '1670.00', close, '1689.00', '1665.20', '3210']] },
    },
  });
}

/** 东财日 K 的最小合法响应（klines 每行 逗号分隔：日期,开,收,高,低,量,额） */
function eastmoneyKlineBody(close: string) {
  return JSON.stringify({
    data: { klines: [`2024-12-30,1670.00,${close},1689.00,1665.20,32100,5385000000`] },
  });
}

const REQ = { symbol: '600519', period: '1d', range: '1y' } as const;

describe('getKline 多源回退', () => {
  test('腾讯成功时不触碰东财', async () => {
    const calls: string[] = [];
    const points = await getKline(REQ, {
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(tencentKlineBody('1683.50'));
      }) as unknown as typeof fetch,
    });
    expect(points).toHaveLength(1);
    expect(points[0].close).toBe(1683.5);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('gtimg.cn');
  });

  test('腾讯失败 → 自动回退东财并返回其数据', async () => {
    const calls: string[] = [];
    const points = await getKline(REQ, {
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        if (String(url).includes('gtimg.cn')) return new Response('', { status: 500 });
        return new Response(eastmoneyKlineBody('1700.00'));
      }) as unknown as typeof fetch,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('eastmoney.com');
    expect(points[0].close).toBe(1700);
  });

  test('全部源失败 → 抛出最后一个源的错误', async () => {
    await expect(
      getKline(REQ, {
        fetchImpl: (async () => new Response('', { status: 503 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('东财 K 线 HTTP 503');
  });

  test('美股只有 Yahoo 一个源，失败即抛出', async () => {
    await expect(
      getKline(
        { symbol: 'AAPL', period: '1d', range: '1y' },
        {
          fetchImpl: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow('Yahoo K 线响应 HTTP 404');
  });
});

describe('getQuote 数据源能力过滤', () => {
  test('A 股跳过无报价接口的东财，失败错误来自腾讯', async () => {
    const calls: string[] = [];
    await expect(
      getQuote('600519', {
        fetchImpl: (async (url: string) => {
          calls.push(String(url));
          return new Response('', { status: 500 });
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('腾讯报价 HTTP 500');
    // 东财没有 fetchQuote，不应被尝试
    expect(calls).toHaveLength(1);
  });
});
