import { describe, expect, test } from 'bun:test';
import {
  buildF10Url,
  fetchCompanyF10,
  parseBoards,
  parseOverview,
  parseSegments,
  parseShareholding,
} from './company-f10';

const noCache = { readCacheImpl: () => null, writeCacheImpl: () => {} };

describe('buildF10Url', () => {
  test('按 emweb 的 code 形态拼前缀代码', () => {
    expect(buildF10Url('CompanySurvey', 'SH600519')).toBe(
      'https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=SH600519',
    );
  });
});

describe('parseOverview', () => {
  test('映射概况字段，并把简介里的全角缩进压平', () => {
    const o = parseOverview({
      jbzl: [
        {
          ORG_NAME: '贵州茅台酒股份有限公司',
          EM2016: '食品饮料-饮料-白酒',
          SECURITY_TYPE: '上交所主板A股',
          CHAIRMAN: '陈华',
          EMP_NUM: 34992,
          REG_CAPITAL: 125008.1601,
          PROVINCE: '贵州',
          ORG_WEB: 'www.moutaichina.com',
          ORG_PROFILE: '    公司成立于1999年,\n\n由茅台集团发起设立。',
        },
      ],
    });
    expect(o?.fullName).toBe('贵州茅台酒股份有限公司');
    expect(o?.employees).toBe(34992);
    expect(o?.profile).toBe('公司成立于1999年, 由茅台集团发起设立。');
  });

  test('缺失数值字段收敛为 undefined 而非 0——员工数 0 是个假事实', () => {
    const o = parseOverview({ jbzl: [{ ORG_NAME: 'X', EMP_NUM: null, REG_CAPITAL: '-' }] });
    expect(o?.employees).toBeUndefined();
    expect(o?.registeredCapital).toBeUndefined();
  });

  test('无 jbzl 时返回 undefined', () => {
    expect(parseOverview({})).toBeUndefined();
    expect(parseOverview({ jbzl: [] })).toBeUndefined();
  });
});

describe('parseSegments', () => {
  const row = (date: string, type: string, name: string, income: number) => ({
    REPORT_DATE: `${date} 00:00:00`,
    MAINOP_TYPE: type,
    ITEM_NAME: name,
    MAIN_BUSINESS_INCOME: income,
    MBI_RATIO: 0.5,
    GROSS_RPOFIT_RATIO: 0.91,
  });

  /**
   * zygcfx 一次返回二十多期。不按最新期过滤的话，2019 年的收入结构会和今年的
   * 摆进同一张表——数字都真，合在一起却毫无意义。
   */
  test('只取最新报告期，历史期全部丢弃', () => {
    const { reportDate, segments } = parseSegments({
      zygcfx: [
        row('2019-12-31', '2', '陈年茅台', 100),
        row('2025-12-31', '2', '茅台酒', 900),
        row('2024-12-31', '2', '系列酒', 500),
      ],
    });
    expect(reportDate).toBe('2025-12-31');
    expect(segments.map((s) => s.name)).toEqual(['茅台酒']);
  });

  test('三个维度分别映射：1 行业 / 2 产品 / 3 地区', () => {
    const { segments } = parseSegments({
      zygcfx: [
        row('2025-12-31', '1', '酒类', 1),
        row('2025-12-31', '2', '茅台酒', 2),
        row('2025-12-31', '3', '国内', 3),
      ],
    });
    expect(segments.map((s) => s.dimension)).toEqual(['industry', 'product', 'region']);
  });

  test('未知 MAINOP_TYPE 直接跳过，不落成 undefined 维度', () => {
    const { segments } = parseSegments({
      zygcfx: [row('2025-12-31', '9', '看不懂的分类', 1), row('2025-12-31', '2', '茅台酒', 2)],
    });
    expect(segments).toHaveLength(1);
  });

  test('空/异常输入返回空 segments 且不给 reportDate', () => {
    expect(parseSegments({})).toEqual({ segments: [] });
    expect(parseSegments({ zygcfx: [] })).toEqual({ segments: [] });
  });
});

describe('parseShareholding', () => {
  const holder = (date: string, rank: number, name: string) => ({
    END_DATE: `${date} 00:00:00`,
    HOLDER_RANK: rank,
    HOLDER_NAME: name,
    HOLD_NUM: 681282935,
    FREE_HOLDNUM_RATIO: 54.4,
    HOLD_NUM_CHANGE: '不变',
  });

  test('户数与十大流通股东一并映射', () => {
    const s = parseShareholding({
      gdrs: [
        {
          END_DATE: '2026-03-31 00:00:00',
          HOLDER_TOTAL_NUM: 243159,
          TOTAL_NUM_RATIO: -4.9759,
          HOLD_FOCUS: '非常分散',
        },
      ],
      sdltgd: [holder('2026-03-31', 1, '茅台集团')],
    });
    expect(s?.endDate).toBe('2026-03-31');
    expect(s?.holderCount).toBe(243159);
    expect(s?.concentration).toBe('非常分散');
    expect(s?.topHolders[0].name).toBe('茅台集团');
  });

  /** sdltgd 同样多期堆一个数组，混排会把上季度的股东和本季度的摆在一起 */
  test('十大流通股东只取最新截止日那一批，并按名次排序', () => {
    const s = parseShareholding({
      gdrs: [{ END_DATE: '2026-03-31 00:00:00', HOLDER_TOTAL_NUM: 1 }],
      sdltgd: [
        holder('2025-12-31', 1, '上一季的股东'),
        holder('2026-03-31', 2, '老二'),
        holder('2026-03-31', 1, '老大'),
      ],
    });
    expect(s?.topHolders.map((h) => h.name)).toEqual(['老大', '老二']);
  });

  test('只有股东名单没有户数时，截止日用名单的日期兜底', () => {
    const s = parseShareholding({ sdltgd: [holder('2026-03-31', 1, '茅台集团')] });
    expect(s?.endDate).toBe('2026-03-31');
    expect(s?.holderCount).toBeUndefined();
  });

  test('两边都空时返回 undefined，让 UI 整块不渲染', () => {
    expect(parseShareholding({})).toBeUndefined();
    expect(parseShareholding({ gdrs: [], sdltgd: [] })).toBeUndefined();
  });
});

describe('parseBoards', () => {
  test('取板块名并去重', () => {
    expect(
      parseBoards({
        ssbk: [{ BOARD_NAME: '食品饮料' }, { BOARD_NAME: '白酒' }, { BOARD_NAME: '白酒' }],
      }),
    ).toEqual(['食品饮料', '白酒']);
  });

  test('异常结构返回空数组', () => {
    expect(parseBoards({})).toEqual([]);
  });
});

describe('fetchCompanyF10', () => {
  /** 按 URL 里的 page 段分派假响应；值为 null 表示该端点返回 500 */
  function fakeFetch(pages: Record<string, unknown>) {
    return (async (url: string) => {
      const page = new URL(url).pathname.split('/')[2];
      const body = pages[page];
      if (body === undefined) return new Response('', { status: 500 });
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
  }

  const FULL = {
    CompanySurvey: { jbzl: [{ ORG_NAME: '贵州茅台酒股份有限公司', EM2016: '白酒' }] },
    BusinessAnalysis: {
      zyfw: [{ BUSINESS_SCOPE: '茅台酒及系列酒的生产与销售' }],
      zygcfx: [
        {
          REPORT_DATE: '2025-12-31 00:00:00',
          MAINOP_TYPE: '2',
          ITEM_NAME: '茅台酒',
          MAIN_BUSINESS_INCOME: 1,
          MBI_RATIO: 1,
        },
      ],
    },
    ShareholderResearch: { gdrs: [{ END_DATE: '2026-03-31 00:00:00', HOLDER_TOTAL_NUM: 243159 }] },
    CoreConception: { ssbk: [{ BOARD_NAME: '食品饮料' }] },
  };

  test('四块齐全时全部落进结果', async () => {
    const r = await fetchCompanyF10('600519', 'SH600519', {
      fetchImpl: fakeFetch(FULL),
      ...noCache,
    });
    expect(r.overview?.fullName).toBe('贵州茅台酒股份有限公司');
    expect(r.overview?.businessScope).toBe('茅台酒及系列酒的生产与销售');
    expect(r.segments).toHaveLength(1);
    expect(r.shareholding?.holderCount).toBe(243159);
    expect(r.boards).toEqual(['食品饮料']);
  });

  /**
   * 与 sectors.ts 的「一张失败即整体失败」是有意的差别：F10 四块是彼此无关的事实，
   * 缺一块不会让另一块变得不准，因此按块降级而不是整体报错。
   */
  test('单块失败降级为缺省，其余三块照常返回', async () => {
    const { ShareholderResearch: _drop, ...rest } = FULL;
    const r = await fetchCompanyF10('600519', 'SH600519', {
      fetchImpl: fakeFetch(rest),
      ...noCache,
    });
    expect(r.shareholding).toBeUndefined();
    expect(r.overview).toBeDefined();
    expect(r.boards).toEqual(['食品饮料']);
  });

  test('四块全空时抛错——那不是「没披露」而是链路挂了或代码不存在', async () => {
    const fetchImpl = fakeFetch({
      CompanySurvey: {},
      BusinessAnalysis: {},
      ShareholderResearch: {},
      CoreConception: {},
    });
    expect(fetchCompanyF10('999999', 'SH999999', { fetchImpl, ...noCache })).rejects.toThrow('F10');
  });

  test('命中缓存时不再打网络', async () => {
    const cachedResult = { symbol: '600519', name: '缓存里的', segments: [], boards: [] };
    let calls = 0;
    const r = await fetchCompanyF10('600519', 'SH600519', {
      fetchImpl: (async () => {
        calls++;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
      readCacheImpl: () => cachedResult as never,
      writeCacheImpl: () => {},
    });
    expect(calls).toBe(0);
    expect(r.name).toBe('缓存里的');
  });
});
