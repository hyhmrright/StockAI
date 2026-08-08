import { describe, expect, it } from 'bun:test';
import { searchStocks } from './search';

/**
 * 离线单测：经 SearchDeps.fetchImpl 注入 fixture 响应。
 * 真网络断言在 search.integration.ts（不进默认 test 套件）——新浪接口 2–8s 抖动，
 * 放在单测里会周期性假红，让人对整个套件失去信任。
 */

/** 新浪 suggest 接口是 GBK 编码的 JSONP 文本 */
function gbkResponse(text: string): Response {
  const gbk = new Uint8Array(Buffer.from(text, 'binary'));
  return new Response(gbk);
}

const SUGGEST_A =
  'var suggestvalue="sh601012,11,601012,sh601012,LiJiLvNeng,,LiJiLvNeng,99,1,ESG,,;"';
const SUGGEST_US = 'var suggestvalue="gb_aapl,41,AAPL,gb_aapl,Apple,,Apple,99,1,,,;"';
const QUOTE_A = 'var hq_str_s_sh601012="LiJiLvNeng,12.93,0.19,1.49,123456,78910";\n';
const QUOTE_US = 'var hq_str_gb_aapl="Apple,313.33,0.29,2026-08-08,0.92,312.41";\n';

/** 按 URL 分派 suggest / 批量行情两段响应 */
function stubFetch(suggest: string, quote: string) {
  return (async (url: string) =>
    gbkResponse(String(url).includes('suggest3') ? suggest : quote)) as unknown as typeof fetch;
}

describe('searchStocks', () => {
  it('A 股：解析 suggest 并补上批量行情', async () => {
    const results = await searchStocks('601012', { fetchImpl: stubFetch(SUGGEST_A, QUOTE_A) });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      code: '601012',
      fullCode: 'sh601012',
      type: 'A股',
      price: 12.93,
      change: 0.19,
      changePercent: 1.49,
    });
  });

  it('美股：fullCode 归一为 gb_ 前缀，行情按美股字段位解析', async () => {
    const results = await searchStocks('AAPL', { fetchImpl: stubFetch(SUGGEST_US, QUOTE_US) });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      code: 'AAPL',
      fullCode: 'gb_aapl',
      type: '美股',
      price: 313.33,
      changePercent: 0.29,
      change: 0.92,
    });
  });

  it('搜索短词直接返回空数组，不发请求', async () => {
    let called = false;
    const results = await searchStocks('A', {
      fetchImpl: (async () => {
        called = true;
        return new Response('');
      }) as unknown as typeof fetch,
    });
    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it('单个中文字是有效搜索词（如「苹」→苹果）', async () => {
    let called = false;
    await searchStocks('苹', {
      fetchImpl: (async (url: string) => {
        called = true;
        return gbkResponse(String(url).includes('suggest3') ? SUGGEST_US : QUOTE_US);
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(true);
  });

  it('suggest 返回非 2xx → 空数组（不抛给调用方）', async () => {
    const results = await searchStocks('601012', {
      fetchImpl: (async () => new Response('', { status: 502 })) as unknown as typeof fetch,
    });
    expect(results).toEqual([]);
  });

  it('网络异常 → 空数组（搜索是辅助功能，绝不阻断主流程）', async () => {
    const results = await searchStocks('601012', {
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(results).toEqual([]);
  });

  // 行情是锦上添花：拿不到也要返回搜索结果本身，只是没有价格
  it('批量行情失败时仍返回搜索结果（仅缺价格字段）', async () => {
    const results = await searchStocks('601012', {
      fetchImpl: (async (url: string) => {
        if (String(url).includes('suggest3')) return gbkResponse(SUGGEST_A);
        throw new Error('quote endpoint down');
      }) as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('601012');
    expect(results[0].price).toBeUndefined();
  });

  it('结果数上限 8 条（控制批量行情请求体积）', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `sh60101${i},11,60101${i},sh60101${i},Stock${i},,Stock${i},99,1,,,`,
    ).join(';');
    const results = await searchStocks('60101', {
      fetchImpl: stubFetch(`var suggestvalue="${many}"`, ''),
    });
    expect(results).toHaveLength(8);
  });
});
