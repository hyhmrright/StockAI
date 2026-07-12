import { describe, test, expect } from 'bun:test';
import {
  parseClistPage,
  buildClistUrl,
  fetchMarketSnapshot,
  type MarketSnapshotDeps,
} from './market-snapshot';
import type { MarketSnapshot } from '../../shared/types';

// 真实 clist 响应形态（curl 实测截取）：data.total + data.diff[]
function makePage(rows: Record<string, unknown>[], total: number) {
  return { data: { total, diff: rows } };
}

const ROW_A = {
  f12: '600664',
  f14: '哈药股份',
  f2: 3.37,
  f3: 10.13,
  f8: 3.97,
  f9: 13.17,
  f20: 8487378282,
  f23: 1.45,
};
const ROW_B = {
  f12: '600821',
  f14: '金开新能',
  f2: 6.11,
  f3: 10.09,
  f8: 4.76,
  f9: -156.52, // 亏损股 PE 为负，原样透传
  f20: 12020355463,
  f23: 1.33,
};

describe('parseClistPage', () => {
  test('f 码字段映射到 MarketSnapshotEntry', () => {
    const entries = parseClistPage(makePage([ROW_A], 1));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      symbol: '600664',
      name: '哈药股份',
      price: 3.37,
      changePercent: 10.13,
      pe: 13.17,
      pb: 1.45,
      marketCap: 8487378282,
      turnoverRate: 3.97,
    });
  });

  test('负 PE（亏损股）原样透传，不被丢弃', () => {
    const entries = parseClistPage(makePage([ROW_B], 1));
    expect(entries[0].pe).toBe(-156.52);
  });

  test('缺失值 "-" 与非数字收敛为 undefined', () => {
    const entries = parseClistPage(makePage([{ f12: '000001', f14: '平安', f2: '-', f9: '-' }], 1));
    expect(entries[0].price).toBeUndefined();
    expect(entries[0].pe).toBeUndefined();
    expect(entries[0].name).toBe('平安');
  });

  test('无代码(f12)的脏行被跳过', () => {
    const entries = parseClistPage(makePage([{ f14: '无代码', f2: 1 }, ROW_A], 2));
    expect(entries.map((e) => e.symbol)).toEqual(['600664']);
  });

  test('data 为 null / diff 缺失 → 空数组', () => {
    expect(parseClistPage({ data: null })).toEqual([]);
    expect(parseClistPage({})).toEqual([]);
    expect(parseClistPage({ data: { total: 0 } })).toEqual([]);
  });
});

describe('buildClistUrl', () => {
  test('含 push2delay host、编码后的全市场 fs、分页参数', () => {
    const url = buildClistUrl(3, 100);
    expect(url).toContain('push2delay.eastmoney.com/api/qt/clist/get');
    expect(url).toContain('pn=3');
    expect(url).toContain('pz=100');
    expect(url).toContain('fltt=2&invt=2');
    // fs 用字面 ':'/','、空格→'+'（东财过滤要求；encodeURIComponent 会破坏过滤），且覆盖北交所
    expect(url).toContain('fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048');
    expect(url).not.toContain('%3A'); // 确认没有过度编码
    expect(url).toContain('fields=f12,f14,f2,f3,f9,f23,f20,f8');
  });
});

describe('fetchMarketSnapshot（DI mock fetch，离线）', () => {
  // 构造多页 fetch：按调用序返回 pages，串行累加直至空页
  function stubDeps(pages: ReturnType<typeof makePage>[]): {
    deps: MarketSnapshotDeps;
    urls: string[];
    written: MarketSnapshot[];
  } {
    const urls: string[] = [];
    const written: MarketSnapshot[] = [];
    let call = 0;
    const deps: MarketSnapshotDeps = {
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        const body = pages[call] ?? { data: { total: 0, diff: [] } };
        call++;
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch,
      readCacheImpl: () => null, // 强制未命中
      writeCacheImpl: ((_k, v) => {
        written.push(v as MarketSnapshot);
      }) as MarketSnapshotDeps['writeCacheImpl'],
      sleepImpl: async () => {}, // 抖动 no-op
    };
    return { deps, urls, written };
  }

  test('分页串行累加：total=3 → 拉满即停，写缓存', async () => {
    const { deps, urls, written } = stubDeps([
      makePage([ROW_A, ROW_B], 3),
      makePage([{ f12: '920992', f14: '中科美菱', f2: 12.03 }], 3),
    ]);
    const snap = await fetchMarketSnapshot(deps);

    expect(snap.entries).toHaveLength(3);
    expect(snap.total).toBe(3);
    expect(snap.entries.map((e) => e.symbol)).toEqual(['600664', '600821', '920992']);
    // 页 1 拿 total=3、页 2 后 entries≥total 即停，共 2 次请求，按 pn 串行
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('pn=1');
    expect(urls[1]).toContain('pn=2');
    expect(written).toHaveLength(1);
    expect(typeof snap.fetchedAt).toBe('number');
  });

  test('空页提前终止（total 不准时的防御）', async () => {
    const { deps, urls } = stubDeps([
      makePage([ROW_A], 9999), // total 虚高
      makePage([], 9999), // 空页 → 停
    ]);
    const snap = await fetchMarketSnapshot(deps);
    expect(snap.entries).toHaveLength(1);
    expect(urls).toHaveLength(2); // 拉到空页即止，不会打满 MAX_PAGES
  });

  test('全空结果不写缓存', async () => {
    const { deps, written } = stubDeps([makePage([], 0)]);
    const snap = await fetchMarketSnapshot(deps);
    expect(snap.entries).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  test('缓存命中直接返回，不发起请求', async () => {
    const cached: MarketSnapshot = {
      entries: [{ symbol: '600519', name: '贵州茅台' }],
      fetchedAt: 111,
      total: 1,
    };
    const urls: string[] = [];
    const snap = await fetchMarketSnapshot({
      readCacheImpl: () => cached,
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return new Response('{}');
      }) as unknown as typeof fetch,
    });
    expect(snap).toBe(cached);
    expect(urls).toHaveLength(0);
  });

  test('HTTP 非 2xx 抛出（交上层 handler 包错误信封）', async () => {
    await expect(
      fetchMarketSnapshot({
        readCacheImpl: () => null,
        fetchImpl: (async () => new Response('bad', { status: 502 })) as unknown as typeof fetch,
        sleepImpl: async () => {},
      }),
    ).rejects.toThrow('502');
  });
});
