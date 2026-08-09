import { describe, expect, it } from 'bun:test';
import type { KlinePoint, NormalizedRequest, RealtimeQuote } from './types';
import { fetchEastmoneyKline } from './eastmoney';
import { fetchTencentKline, fetchTencentQuote, fetchTencentUsQuote } from './tencent';
import { fetchYahooKline, fetchYahooQuote } from './yahoo';
import { fetchSinaKline, fetchSinaUsQuote, fetchSinaCnQuote } from './sina';

/**
 * K 线/报价数据源的真网络冒烟——只跑 `bun run test:integration`，默认套件不含。
 *
 * 回答的问题只有一个：**上游响应是否还和我们的解析假设一致**。解析细节的断言在
 * 各源的 `*.test.ts`（离线 fixture），那些测试对上游改版是结构性失明的——fixture 永远
 * 不会变，所以永远绿。这里是唯一能发现「接口改了/字段没了/被封了」的地方。
 *
 * **只断言形状，不断言数值**：价格、成交量每天都变，断具体值等于制造每日假红。
 * 断言的是「非空 + 关键字段是有限数 + 自洽」——这些一旦不成立，必然是上游变了。
 *
 * 逐源直连（而非走 `getKline` 的回退链）是刻意的：回退链会用腾讯的成功掩盖东财的失效，
 * 那正是监控要暴露的东西。
 */

const CN_SYMBOL = '600519'; // 贵州茅台——沪市超大盘，退市/停牌风险最低
const US_SYMBOL = 'AAPL';

/** 逐源直连需要 sidecar 内部规范化后的参数，这里手工构造（正常由 kline/index.ts 的 normalize 产出） */
function req(rawSymbol: string, market: 'A股' | '美股'): NormalizedRequest {
  return { rawSymbol, period: '1d', range: '3m', adjust: 'qfq', market };
}

/** K 线契约：够长 + 首根各字段是有限数 + 最高价不低于最低价 */
function expectKlineContract(points: KlinePoint[]): void {
  expect(points.length).toBeGreaterThan(20);
  const p = points[0];
  for (const field of ['time', 'open', 'high', 'low', 'close', 'volume'] as const) {
    expect(Number.isFinite(p[field])).toBe(true);
  }
  expect(p.high).toBeGreaterThanOrEqual(p.low);
  expect(p.time).toBeGreaterThan(0);
}

/** 报价契约：名称能解析出来（证明响应结构没变）+ 现价为正 + 昨收是有限数 */
function expectQuoteContract(quote: RealtimeQuote): void {
  expect(quote.name.length).toBeGreaterThan(0);
  expect(quote.price).toBeGreaterThan(0);
  expect(Number.isFinite(quote.prevClose)).toBe(true);
}

describe('K 线数据源（真网络）', () => {
  it('腾讯 K 线（A 股首选源）', async () => {
    expectKlineContract(await fetchTencentKline(req(CN_SYMBOL, 'A股')));
  });

  it('腾讯报价（A 股首选报价源）', async () => {
    expectQuoteContract(await fetchTencentQuote(CN_SYMBOL));
  });

  it('东财 K 线（A 股回退源——被腾讯的成功掩盖，只能单独测）', async () => {
    expectKlineContract(await fetchEastmoneyKline(req(CN_SYMBOL, 'A股')));
  });

  it('新浪报价（A 股回退源）', async () => {
    expectQuoteContract(await fetchSinaCnQuote(CN_SYMBOL));
  });

  it('Yahoo K 线（美股首选源——唯一提供复权历史的源）', async () => {
    expectKlineContract(await fetchYahooKline(req(US_SYMBOL, '美股')));
  });

  it('Yahoo 报价（美股回退源）', async () => {
    expectQuoteContract(await fetchYahooQuote(US_SYMBOL));
  });

  it('腾讯报价（美股首选报价源）', async () => {
    expectQuoteContract(await fetchTencentUsQuote(US_SYMBOL));
  });

  it('腾讯报价（美股指数——代码写法与个股不同，需单独盯）', async () => {
    // ^GSPC 要映射成 usINX；映射错了拿到的是空响应而非报错
    expectQuoteContract(await fetchTencentUsQuote('^GSPC'));
  });

  it('新浪报价（美股回退源）', async () => {
    expectQuoteContract(await fetchSinaUsQuote(US_SYMBOL));
  });

  it('新浪日 K（美股回退源——Yahoo 不可达时的唯一 K 线来源）', async () => {
    expectKlineContract(await fetchSinaKline(req(US_SYMBOL, '美股')));
  });

  it('新浪日 K 聚合出的月线（走的是与日线不同的代码路径）', async () => {
    const monthly = await fetchSinaKline({
      rawSymbol: US_SYMBOL,
      period: '1mo',
      range: '5y',
      adjust: 'qfq',
      market: '美股',
    });
    expectKlineContract(monthly);
    // 月线根数必然远少于同期日线；两者相等说明聚合根本没生效
    expect(monthly.length).toBeLessThan(100);
  });
});
