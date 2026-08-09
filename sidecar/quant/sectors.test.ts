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

  /** 新浪板块榜的最小合法响应（GBK 在 fixture 里无所谓，字段全是 ASCII 与中文名） */
  function sinaBoardBody(rows: string[][]) {
    const table = Object.fromEntries(rows.map((f) => [f[0], f.join(',')]));
    return `var S_Finance_bankuai = ${JSON.stringify(table)};`;
  }
  const sinaRow = (code: string, name: string, pct: string) => [
    code,
    name,
    '19',
    '17.06',
    '0.71',
    pct,
    '938514036',
    '25437696452',
    'sz300395',
    '9.495',
    '89.600',
    '7.770',
    'LEADER',
  ];

  test('一张榜失败即整组回退到新浪——不混用两个源，字段覆盖度不一致更像 bug', async () => {
    const calls: string[] = [];
    const halfBroken = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('sina.com.cn')) {
        return new Response(sinaBoardBody([sinaRow('new_blhy', 'GLASS-IND', '4.35')]));
      }
      // 概念那张挂掉，行业那张是好的
      return String(url).includes('t:3')
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify({ data: { diff: [ROW] } }));
    }) as unknown as typeof fetch;

    const boards = await fetchSectorBoards({ fetchImpl: halfBroken, ...noCache });
    // 行业那张东财本来是成功的，但仍整组改用新浪
    expect(boards.industry[0].name).toBe('GLASS-IND');
    expect(boards.concept[0].name).toBe('GLASS-IND');
    expect(calls.filter((u) => u.includes('sina.com.cn'))).toHaveLength(2);
  });

  test('东财与新浪都失败才整体抛出', async () => {
    await expect(
      fetchSectorBoards({
        fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
        ...noCache,
      }),
    ).rejects.toThrow('新浪板块榜 HTTP 500');
  });

  test('备源没有资金流与涨跌家数，留空而不是填 0', async () => {
    // 「主力净流入 0」会被读成"没有资金进出"，那是一句我们并不知道的断言
    const boards = await fetchSectorBoards({
      fetchImpl: (async (url: string) =>
        String(url).includes('sina.com.cn')
          ? new Response(sinaBoardBody([sinaRow('new_blhy', 'GLASS-IND', '4.35')]))
          : new Response('', { status: 502 })) as unknown as typeof fetch,
      ...noCache,
    });
    const row = boards.industry[0];
    expect(row.changePercent).toBe(4.35);
    expect(row.mainNetInflow).toBeUndefined();
    expect(row.advancers).toBeUndefined();
    expect(row.decliners).toBeUndefined();
    expect(row.leader).toMatchObject({ name: 'LEADER', symbol: 'sz300395' });
  });

  test('备源解析为空时抛出，不把东财故障伪装成空面板', async () => {
    await expect(
      fetchSectorBoards({
        fetchImpl: (async (url: string) =>
          String(url).includes('sina.com.cn')
            ? new Response('var S_Finance_bankuai = {};')
            : new Response('', { status: 502 })) as unknown as typeof fetch,
        ...noCache,
      }),
    ).rejects.toThrow('新浪板块榜解析为空');
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
