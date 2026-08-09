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

/** Yahoo Chart API 的最小合法响应 */
function yahooKlineBody(close: number) {
  return JSON.stringify({
    chart: {
      result: [
        {
          timestamp: [1754570000],
          indicators: {
            quote: [{ open: [310], high: [315], low: [309], close: [close], volume: [1] }],
          },
        },
      ],
    },
  });
}

/** 新浪美股日 K 的最小合法响应，含它那段防盗链 JSONP 外壳 */
function sinaDailyKBody() {
  const rows = [
    { d: '2026-08-06', o: '310.0', h: '315.0', l: '309.0', c: '311.0', v: '100' },
    { d: '2026-08-07', o: '311.45', h: '314.81', l: '310.74', c: '313.33', v: '200' },
  ];
  return `/*<script>location.href='//sina.com';</script>*/\nx(${JSON.stringify(rows)});`;
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

  test('美股 K 线 Yahoo 优先 —— 成功时不回退到不复权的中文源', async () => {
    // 顺序不是随手排的：中文源给的美股历史一律不复权，跨拆股会出现假断层，
    // 所以只在 Yahoo 拿不到时才用。这条钉住「Yahoo 成功就到此为止」。
    const calls: string[] = [];
    const points = await getKline(
      { symbol: 'AAPL', period: '1d', range: '1y' },
      {
        fetchImpl: (async (url: string) => {
          calls.push(String(url));
          return new Response(yahooKlineBody(313.33));
        }) as unknown as typeof fetch,
      },
    );
    expect(points[0].close).toBe(313.33);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('finance.yahoo.com');
  });

  test('美股 K 线 Yahoo 不可达 → 回退新浪日 K', async () => {
    // 「好多地区根本连不上 Yahoo」正是这条兜底存在的理由
    const calls: string[] = [];
    const points = await getKline(
      { symbol: 'AAPL', period: '1d', range: 'all' },
      {
        fetchImpl: (async (url: string) => {
          calls.push(String(url));
          if (String(url).includes('yahoo.com')) return new Response('', { status: 403 });
          return new Response(sinaDailyKBody());
        }) as unknown as typeof fetch,
      },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('sina.com.cn');
    expect(points.map((p) => p.close)).toEqual([311, 313.33]);
  });

  test('美股分钟线跳过只有日线的新浪，不白打一趟', async () => {
    const calls: string[] = [];
    await expect(
      getKline(
        { symbol: 'AAPL', period: '5m', range: '5d' },
        {
          fetchImpl: (async (url: string) => {
            calls.push(String(url));
            return new Response('', { status: 503 });
          }) as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow('Yahoo K 线响应 HTTP 503');
    expect(calls.filter((u) => u.includes('sina'))).toHaveLength(0);
  });
});

describe('getQuote 数据源能力过滤', () => {
  test('A 股跳过无报价接口的东财，只在腾讯与新浪之间回退', async () => {
    const calls: string[] = [];
    await expect(
      getQuote('600519', {
        fetchImpl: (async (url: string) => {
          calls.push(String(url));
          return new Response('', { status: 500 });
        }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('新浪 A 股报价 HTTP 500');
    // 东财没有 fetchQuote，不应被尝试
    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes('eastmoney'))).toBe(false);
  });

  test('A 股报价腾讯失败 → 新浪接手（此前腾讯是唯一源，挂了就没报价）', async () => {
    const quote = await getQuote('600519', {
      fetchImpl: (async (url: string) => {
        if (String(url).includes('gtimg.cn')) return new Response('', { status: 500 });
        return new Response(sinaCnQuoteBody('1309.220'));
      }) as unknown as typeof fetch,
    });
    expect(quote.price).toBe(1309.22);
    expect(quote.market).toBe('A股');
  });

  test('美股报价腾讯优先 —— 报价无复权之分，先用可达性更好的源', async () => {
    const calls: string[] = [];
    const quote = await getQuote('AAPL', {
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(tencentUsQuoteBody('313.33'));
      }) as unknown as typeof fetch,
    });
    expect(quote.price).toBe(313.33);
    expect(quote.currency).toBe('USD');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('gtimg.cn');
  });

  test('美股指数 ^GSPC 映射到各源自己的写法', async () => {
    const calls: string[] = [];
    await getQuote('^GSPC', {
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(tencentUsQuoteBody('7757.64'));
      }) as unknown as typeof fetch,
    });
    // Yahoo 写 ^GSPC，腾讯写 usINX——照搬 Yahoo 代码只会拿到空响应
    expect(calls[0]).toContain('q=usINX');
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

/** 腾讯**美股**报价的最小合法响应（字段索引见 tencent.ts parseTencentUsQuote） */
function tencentUsQuoteBody(price: string) {
  const f = new Array(50).fill('0');
  f[1] = 'AAPL-CN';
  f[3] = price;
  f[4] = '312.41';
  f[35] = 'USD';
  return `v_usAAPL="${f.join('~')}";`;
}

/** 新浪 A 股报价的最小合法响应（字段索引见 sina.ts parseSinaCnQuote） */
function sinaCnQuoteBody(price: string) {
  const f = new Array(33).fill('0');
  f[0] = 'MOUTAI';
  f[1] = '1308.660';
  f[2] = '1308.550';
  f[3] = price;
  f[30] = '2026-08-07';
  f[31] = '15:34:59';
  return `var hq_str_sh600519="${f.join(',')}";`;
}

describe('getQuotes 批量报价', () => {
  /** 按 url 里的代码回不同响应；failFor 中的代码在**所有源**上都返回 500 */
  function quoteFetch(failFor: string[] = []) {
    return (async (url: string) => {
      // 腾讯是 ?q=sh600519，新浪是 /list=sh600519——只认前者会让新浪那一跳静静拿到成功响应
      const code = String(url).match(/(?:q=|list=)([\w$]+)/)?.[1] ?? '';
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
    ).rejects.toThrow('新浪 A 股报价 HTTP 500'); // 链尾那个源的错误
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
