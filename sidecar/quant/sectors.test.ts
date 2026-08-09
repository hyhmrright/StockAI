import { describe, test, expect } from 'bun:test';
import { buildSectorUrl, parseSectorPage, fetchSectorBoards, SECTOR_TOP_N } from './sectors';

/** 东财板块榜一行的真实形状（字段取自实测响应） */
const ROW = {
  f3: 10.84,
  f12: 'BK0899',
  f14: 'CRO',
  f62: 2_823_992_576,
  f104: 41,
  f105: 0,
  f128: '百花医药',
  f140: '600721',
  f136: 10.02,
};

describe('buildSectorUrl', () => {
  test('np=1 必须在——不带它 diff 会退化成对象，解析静默得空表', () => {
    expect(buildSectorUrl('industry')).toContain('np=1');
  });

  test('行业与概念用不同的 fs 过滤，且按涨跌幅降序', () => {
    expect(buildSectorUrl('industry')).toContain('fs=m:90+t:2');
    expect(buildSectorUrl('concept')).toContain('fs=m:90+t:3');
    expect(buildSectorUrl('industry')).toContain('fid=f3');
    expect(buildSectorUrl('industry')).toContain('po=1');
  });

  test('默认只取头部若干个，不拉全量 500', () => {
    expect(buildSectorUrl('concept')).toContain(`pz=${SECTOR_TOP_N}`);
  });
});

describe('parseSectorPage', () => {
  test('映射全部字段', () => {
    const [s] = parseSectorPage({ data: { diff: [ROW] } });
    expect(s).toEqual({
      code: 'BK0899',
      name: 'CRO',
      changePercent: 10.84,
      mainNetInflow: 2_823_992_576,
      advancers: 41,
      decliners: 0,
      leader: { name: '百花医药', symbol: '600721', changePercent: 10.02 },
    });
  });

  test('领涨股字段缺失时整体不给，不产出半截信息', () => {
    const [s] = parseSectorPage({ data: { diff: [{ ...ROW, f140: undefined }] } });
    expect(s.leader).toBeUndefined();
  });

  test('缺失的数值收敛为 0 而不是 NaN', () => {
    const [s] = parseSectorPage({ data: { diff: [{ f12: 'BK1', f3: '-', f62: null }] } });
    expect(s.changePercent).toBe(0);
    expect(s.mainNetInflow).toBe(0);
  });

  test('无代码的脏行被跳过', () => {
    expect(parseSectorPage({ data: { diff: [{ f14: '幽灵板块' }, ROW] } })).toHaveLength(1);
  });

  test('diff 不是数组时返回空表而不是抛', () => {
    // 正是漏掉 np=1 时的形态：{"0":{...}} 对象
    expect(parseSectorPage({ data: { diff: { 0: ROW } as never } })).toEqual([]);
    expect(parseSectorPage({})).toEqual([]);
  });
});

describe('fetchSectorBoards', () => {
  /**
   * 强制缓存未命中。缓存落在系统临时目录、跨进程存活——本机跑过一次真实 `--sectors` 后，
   * 这些用例会直接吃到那份真数据、一发请求都不发（已实测踩到）。写也置空，避免污染真实缓存。
   */
  const noCache = { readCacheImpl: () => null, writeCacheImpl: () => {} };

  const okFetch = (async (url: string) =>
    new Response(
      JSON.stringify({
        data: { diff: [{ ...ROW, f14: String(url).includes('t:2') ? '行业' : '概念' }] },
      }),
    )) as unknown as typeof fetch;

  test('行业与概念各拉一张榜', async () => {
    const boards = await fetchSectorBoards({ fetchImpl: okFetch, ...noCache });
    expect(boards.industry[0].name).toBe('行业');
    expect(boards.concept[0].name).toBe('概念');
    expect(boards.fetchedAt).toBeGreaterThan(0);
  });

  test('一张榜失败即整体失败——半截的市场概览比没有更容易误导', async () => {
    const halfBroken = (async (url: string) =>
      String(url).includes('t:3')
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify({ data: { diff: [ROW] } }))) as unknown as typeof fetch;

    await expect(fetchSectorBoards({ fetchImpl: halfBroken, ...noCache })).rejects.toThrow(
      '东财板块榜 HTTP 500',
    );
  });

  /** 加缓存的全部理由：两张榜合计约 1.8s，而面板按页签条件挂载，开关弹窗即重取 */
  test('缓存命中时一发请求都不发', async () => {
    const calls: string[] = [];
    const parsed = parseSectorPage({ data: { diff: [ROW] } });
    const cached = { industry: parsed, concept: parsed, fetchedAt: 1 };
    const boards = await fetchSectorBoards({
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return new Response('{}');
      }) as unknown as typeof fetch,
      readCacheImpl: () => cached as never,
      writeCacheImpl: () => {},
    });

    expect(boards).toEqual(cached);
    expect(calls).toHaveLength(0);
  });

  /** 漏 np=1 时解析静默得空表（本模块开头那个坑）——缓存下来就固化成一分钟的空榜 */
  test('任一张榜为空时不写缓存', async () => {
    const written: unknown[] = [];
    const emptyConcept = (async (url: string) =>
      new Response(
        JSON.stringify({ data: { diff: String(url).includes('t:3') ? [] : [ROW] } }),
      )) as unknown as typeof fetch;

    await fetchSectorBoards({
      fetchImpl: emptyConcept,
      readCacheImpl: () => null,
      writeCacheImpl: ((_k: string, v: unknown) => {
        written.push(v);
      }) as never,
    });

    expect(written).toHaveLength(0);
  });
});
