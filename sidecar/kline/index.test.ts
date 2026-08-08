import { describe, test, expect } from 'bun:test';
import { getKline, getQuote, getQuotes } from './index';
import { MAX_BATCH_QUOTES } from '../../shared/constants';

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

/** 腾讯报价的最小合法响应（字段索引见 tencent.ts parseTencentQuote） */
function tencentQuoteBody(symbol: string, price: string) {
  const f = new Array(47).fill('0');
  f[1] = `名称${symbol}`;
  f[3] = price;
  f[4] = '100';
  return `v_${symbol}="${f.join('~')}";`;
}

describe('getQuotes 批量报价', () => {
  /** 按 url 里的代码回不同响应；failFor 中的代码返回 500 */
  function quoteFetch(failFor: string[] = []) {
    return (async (url: string) => {
      const code = String(url).match(/q=(\w+)/)?.[1] ?? '';
      if (failFor.some((f) => code.includes(f))) return new Response('', { status: 500 });
      return new Response(tencentQuoteBody(code, '1683.50'));
    }) as unknown as typeof fetch;
  }

  test('结果按调用方传入的原始代码建索引，而非数据源规范化后的代码', async () => {
    // 传入裸代码 600519，腾讯内部会转成 sh600519；调用方手里只有前者
    const { quotes } = await getQuotes(['600519'], { fetchImpl: quoteFetch() });
    expect(Object.keys(quotes)).toEqual(['600519']);
    expect(quotes['600519'].price).toBe(1683.5);
  });

  test('单只失败只进 failed，不影响其余', async () => {
    const { quotes, failed } = await getQuotes(['600519', '000001'], {
      fetchImpl: quoteFetch(['000001']),
    });
    expect(failed).toEqual(['000001']);
    expect(Object.keys(quotes)).toEqual(['600519']);
  });

  test('全批失败时抛出，而不是静静返回空表', async () => {
    // 数据源整体挂掉与"这些代码都查无此股"必须可区分：返回 {} 会让上层把它当成正常空结果
    await expect(
      getQuotes(['600519', '000001'], { fetchImpl: quoteFetch(['600519', '000001']) }),
    ).rejects.toThrow('腾讯报价 HTTP 500');
  });

  test('去重后只对每个代码请求一次', async () => {
    const calls: string[] = [];
    await getQuotes(['600519', '600519', ' 600519 ', ''], {
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(tencentQuoteBody('sh600519', '1683.50'));
      }) as unknown as typeof fetch,
    });
    expect(calls).toHaveLength(1);
  });

  test('超出规模上限直接抛错，而不是截断', async () => {
    // 截断会让持仓组合少算几只，总市值却照样显示成完整数字——比报错更坏
    const many = Array.from(
      { length: MAX_BATCH_QUOTES + 1 },
      (_, i) => `60${String(i).padStart(4, '0')}`,
    );
    await expect(getQuotes(many, { fetchImpl: quoteFetch() })).rejects.toThrow(
      `最多 ${MAX_BATCH_QUOTES} 只`,
    );
  });

  test('空列表是空操作，不发请求也不抛', async () => {
    const calls: string[] = [];
    const result = await getQuotes([], {
      fetchImpl: (async () => {
        calls.push('x');
        return new Response('');
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ quotes: {}, failed: [] });
    expect(calls).toHaveLength(0);
  });
});
