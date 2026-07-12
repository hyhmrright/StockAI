import { describe, expect, test } from 'bun:test';
import type {
  MarketSnapshot,
  MarketSnapshotEntry,
  QuantBundle,
  ScreenCondition,
} from '../../shared/types';
import type { ChatProvider } from '../agents/types';
import {
  boardOf,
  CANDIDATE_CAP,
  cmp,
  matchesCoarse,
  resolveFieldValue,
  runScreen,
  ScreenNoConditionsError,
  ScreenParseError,
  validateScreenQuery,
} from './nl-screen';

// ── 测试夹具 ────────────────────────────────────────────────────────────────

/** 构造快照条目（缺省字段全填，测试各自覆盖需要的字段） */
function entry(over: Partial<MarketSnapshotEntry> & { symbol: string }): MarketSnapshotEntry {
  return {
    name: `股票${over.symbol}`,
    price: 10,
    changePercent: 1,
    pe: 15,
    pb: 2,
    marketCap: 1e10,
    turnoverRate: 1,
    ...over,
  };
}

/** 构造仅含被测 fine 字段的 QuantBundle（roe / compositeScore） */
function makeQuant(
  symbol: string,
  opts: { roe?: number; compositeScore?: number } = {},
): QuantBundle {
  const checks =
    opts.roe === undefined
      ? []
      : [{ key: 'roe', actual: opts.roe, threshold: 15, comparator: 'gte' as const, passed: null }];
  return {
    symbol,
    technical: { signal: 'neutral', confidence: 0.5, details: {} },
    fundamental: { signal: 'neutral', confidence: 0.5, details: {}, checks },
    composite: { signal: 'neutral', score: opts.compositeScore ?? 50 },
    fetchedAt: 0,
  };
}

/** 返回固定 JSON 串的 fake ChatProvider（忽略 prompt，验证解析/流程解耦） */
function fakeChat(json: string): ChatProvider {
  return { chat: async () => json };
}

const noopSleep = async () => {};

// ── validateScreenQuery ──────────────────────────────────────────────────────

describe('validateScreenQuery', () => {
  test('合法查询原样通过', () => {
    const q = validateScreenQuery({
      conditions: [{ field: 'roe', op: 'gte', value: 15 }],
      board: 'main',
      limit: 20,
    });
    expect(q.conditions).toEqual([{ field: 'roe', op: 'gte', value: 15 }]);
    expect(q.board).toBe('main');
    expect(q.limit).toBe(20);
  });

  test('非对象输入抛 ScreenParseError', () => {
    expect(() => validateScreenQuery(null)).toThrow(ScreenParseError);
    expect(() => validateScreenQuery('foo')).toThrow(ScreenParseError);
    expect(() => validateScreenQuery([])).toThrow(ScreenParseError);
  });

  test('缺 conditions（非数组）抛 ScreenParseError', () => {
    expect(() => validateScreenQuery({ board: 'main' })).toThrow(ScreenParseError);
  });

  test('非法 op / value 非数 / 未知 field 逐条丢弃', () => {
    const q = validateScreenQuery({
      conditions: [
        { field: 'pe', op: 'lt', value: 20 }, // 合法保留
        { field: 'pe', op: 'between', value: 5 }, // 非法 op → 丢
        { field: 'pb', op: 'lt', value: 'x' }, // value 非数 → 丢
        { field: 'gdp', op: 'gt', value: 1 }, // 未知 field → 丢
      ],
    });
    expect(q.conditions).toEqual([{ field: 'pe', op: 'lt', value: 20 }]);
  });

  test('全部条件被丢弃 → ScreenNoConditionsError', () => {
    expect(() =>
      validateScreenQuery({ conditions: [{ field: 'bad', op: 'gt', value: 1 }] }),
    ).toThrow(ScreenNoConditionsError);
  });

  test('LLM 返回空 conditions → ScreenNoConditionsError', () => {
    expect(() => validateScreenQuery({ conditions: [] })).toThrow(ScreenNoConditionsError);
  });

  test('board 非法归 all；limit clamp 到 1..100；sortBy.field 非法丢弃', () => {
    const q = validateScreenQuery({
      conditions: [{ field: 'pe', op: 'lt', value: 20 }],
      board: 'hk',
      limit: 999,
      sortBy: { field: 'gdp', order: 'asc' },
    });
    expect(q.board).toBe('all');
    expect(q.limit).toBe(100);
    expect(q.sortBy).toBeUndefined();
  });

  test('limit 缺省用 DEFAULT_LIMIT；sortBy 合法保留', () => {
    const q = validateScreenQuery({
      conditions: [{ field: 'pe', op: 'lt', value: 20 }],
      sortBy: { field: 'marketCap', order: 'asc' },
    });
    expect(q.limit).toBe(30);
    expect(q.sortBy).toEqual({ field: 'marketCap', order: 'asc' });
  });
});

// ── boardOf ──────────────────────────────────────────────────────────────────

describe('boardOf', () => {
  test('前缀归类', () => {
    expect(boardOf('600519')).toBe('main'); // 沪市主板
    expect(boardOf('688981')).toBe('star'); // 科创
    expect(boardOf('000001')).toBe('main'); // 深市主板
    expect(boardOf('002415')).toBe('main'); // 原中小板→主板
    expect(boardOf('300750')).toBe('chinext'); // 创业
    expect(boardOf('301029')).toBe('chinext'); // 创业
    expect(boardOf('830799')).toBe('bj'); // 北交
    expect(boardOf('430047')).toBe('bj'); // 北交
  });

  test('容忍带交易所前缀', () => {
    expect(boardOf('SH600519')).toBe('main');
    expect(boardOf('sz300750')).toBe('chinext');
  });
});

// ── cmp ──────────────────────────────────────────────────────────────────────

describe('cmp', () => {
  test('各比较符', () => {
    expect(cmp(20, 'gt', 15)).toBe(true);
    expect(cmp(15, 'gt', 15)).toBe(false);
    expect(cmp(15, 'gte', 15)).toBe(true);
    expect(cmp(10, 'lt', 15)).toBe(true);
    expect(cmp(15, 'lte', 15)).toBe(true);
    expect(cmp(15, 'eq', 15)).toBe(true);
  });

  test('actual 缺失一律判不通过', () => {
    expect(cmp(undefined, 'gt', 0)).toBe(false);
    expect(cmp(undefined, 'lt', 100)).toBe(false);
  });
});

// ── resolveFieldValue ────────────────────────────────────────────────────────

describe('resolveFieldValue', () => {
  const e = entry({ symbol: '600519', pe: 18, pb: 2.5, marketCap: 2e12 });

  test('coarse 字段从快照读', () => {
    expect(resolveFieldValue('pe', e)).toBe(18);
    expect(resolveFieldValue('pb', e)).toBe(2.5);
    expect(resolveFieldValue('marketCap', e)).toBe(2e12);
  });

  test('roe 从 fundamental.checks key=roe 的 actual 读', () => {
    const q = makeQuant('600519', { roe: 22 });
    expect(resolveFieldValue('roe', e, q)).toBe(22);
  });

  test('compositeScore 从 composite.score 读', () => {
    const q = makeQuant('600519', { compositeScore: 78 });
    expect(resolveFieldValue('compositeScore', e, q)).toBe(78);
  });

  test('fine 字段无 quant → undefined', () => {
    expect(resolveFieldValue('roe', e)).toBeUndefined();
  });

  test('fine 字段 quant 中缺该 check → undefined', () => {
    const q = makeQuant('600519', {}); // 无 roe check
    expect(resolveFieldValue('roe', e, q)).toBeUndefined();
  });
});

// ── matchesCoarse ────────────────────────────────────────────────────────────

describe('matchesCoarse', () => {
  const conds: ScreenCondition[] = [
    { field: 'pe', op: 'lt', value: 20 },
    { field: 'pb', op: 'lt', value: 3 },
  ];

  test('pe<20 & pb<3 过滤正确', () => {
    expect(matchesCoarse(entry({ symbol: '600519', pe: 18, pb: 2 }), conds, 'all')).toBe(true);
    expect(matchesCoarse(entry({ symbol: '600519', pe: 25, pb: 2 }), conds, 'all')).toBe(false);
    expect(matchesCoarse(entry({ symbol: '600519', pe: 18, pb: 4 }), conds, 'all')).toBe(false);
  });

  test('board:main 排除科创/创业', () => {
    expect(matchesCoarse(entry({ symbol: '600519', pe: 18, pb: 2 }), conds, 'main')).toBe(true);
    expect(matchesCoarse(entry({ symbol: '688981', pe: 18, pb: 2 }), conds, 'main')).toBe(false);
    expect(matchesCoarse(entry({ symbol: '300750', pe: 18, pb: 2 }), conds, 'main')).toBe(false);
  });

  test('缺值字段判不通过', () => {
    expect(matchesCoarse(entry({ symbol: '600519', pe: undefined, pb: 2 }), conds, 'all')).toBe(
      false,
    );
  });
});

// ── runScreen（DI 注入 fake chat/snapshot/quant）─────────────────────────────

describe('runScreen 纯粗筛路径', () => {
  test('无 fine 条件：_fetchQuant 0 次、refinedCount=0、按市值降序取 limit', async () => {
    const snapshot: MarketSnapshot = {
      entries: [
        entry({ symbol: '600001', pe: 10, marketCap: 3e10 }),
        entry({ symbol: '600002', pe: 12, marketCap: 5e10 }),
        entry({ symbol: '600003', pe: 25, marketCap: 9e10 }), // pe 超标，排除
      ],
      fetchedAt: 0,
      total: 3,
    };
    let quantCalls = 0;
    const res = await runScreen({
      nlQuery: '市盈率小于20',
      chat: fakeChat(JSON.stringify({ conditions: [{ field: 'pe', op: 'lt', value: 20 }] })),
      _fetchSnapshot: async () => snapshot,
      _fetchQuant: async (s) => {
        quantCalls++;
        return makeQuant(s);
      },
      _sleep: noopSleep,
    });

    expect(quantCalls).toBe(0);
    expect(res.refinedCount).toBe(0);
    expect(res.scannedCoarse).toBe(2);
    // 市值降序：600002(5e10) 先于 600001(3e10)
    expect(res.matches.map((m) => m.symbol)).toEqual(['600002', '600001']);
    expect(res.matches.every((m) => m.quant === undefined)).toBe(true);
  });
});

describe('runScreen 精拉路径', () => {
  test('fine 条件过滤正确 + 单只 reject 被跳过', async () => {
    const snapshot: MarketSnapshot = {
      entries: [
        entry({ symbol: '600001', pe: 10 }),
        entry({ symbol: '600002', pe: 10 }),
        entry({ symbol: '600003', pe: 10 }),
      ],
      fetchedAt: 0,
      total: 3,
    };
    const quantMap: Record<string, QuantBundle> = {
      '600001': makeQuant('600001', { roe: 22, compositeScore: 80 }), // 通过
      '600002': makeQuant('600002', { roe: 8, compositeScore: 60 }), // roe 不达标
    };
    let quantCalls = 0;
    const res = await runScreen({
      nlQuery: 'ROE大于15',
      chat: fakeChat(JSON.stringify({ conditions: [{ field: 'roe', op: 'gt', value: 15 }] })),
      _fetchSnapshot: async () => snapshot,
      _fetchQuant: async (s) => {
        quantCalls++;
        const q = quantMap[s];
        if (!q) throw new Error('精拉失败'); // 600003 reject
        return q;
      },
      _sleep: noopSleep,
    });

    expect(quantCalls).toBe(3); // 三只都发起精拉
    expect(res.refinedCount).toBe(2); // reject 的 600003 不计入
    expect(res.matches.map((m) => m.symbol)).toEqual(['600001']); // 仅 roe>15 命中
    expect(res.matches[0].quant?.symbol).toBe('600001'); // 命中项带 quant
  });

  test('精拉数量不超过 CANDIDATE_CAP', async () => {
    const entries = Array.from({ length: CANDIDATE_CAP + 5 }, (_, i) =>
      entry({ symbol: `60${String(i).padStart(4, '0')}`, pe: 10, marketCap: 1e10 + i }),
    );
    let quantCalls = 0;
    const res = await runScreen({
      nlQuery: 'ROE大于0且市盈率小于20',
      chat: fakeChat(
        JSON.stringify({
          conditions: [
            { field: 'pe', op: 'lt', value: 20 },
            { field: 'roe', op: 'gt', value: 0 },
          ],
        }),
      ),
      _fetchSnapshot: async () => ({ entries, fetchedAt: 0, total: entries.length }),
      _fetchQuant: async (s) => {
        quantCalls++;
        return makeQuant(s, { roe: 20, compositeScore: 70 });
      },
      _sleep: noopSleep,
    });

    expect(res.scannedCoarse).toBe(CANDIDATE_CAP + 5); // 全部通过粗筛
    expect(quantCalls).toBe(CANDIDATE_CAP); // 精拉上限
    expect(res.refinedCount).toBe(CANDIDATE_CAP);
  });

  test('LLM 非 JSON → ScreenParseError', async () => {
    await expect(
      runScreen({
        nlQuery: '随便',
        chat: fakeChat('这不是 JSON'),
        _fetchSnapshot: async () => ({ entries: [], fetchedAt: 0, total: 0 }),
        _sleep: noopSleep,
      }),
    ).rejects.toBeInstanceOf(ScreenParseError);
  });

  test('LLM 空条件 → ScreenNoConditionsError', async () => {
    await expect(
      runScreen({
        nlQuery: '今天天气如何',
        chat: fakeChat(JSON.stringify({ conditions: [] })),
        _fetchSnapshot: async () => ({ entries: [], fetchedAt: 0, total: 0 }),
        _sleep: noopSleep,
      }),
    ).rejects.toBeInstanceOf(ScreenNoConditionsError);
  });

  test('空快照 → 抛错', async () => {
    await expect(
      runScreen({
        nlQuery: '市盈率小于20',
        chat: fakeChat(JSON.stringify({ conditions: [{ field: 'pe', op: 'lt', value: 20 }] })),
        _fetchSnapshot: async () => ({ entries: [], fetchedAt: 0, total: 0 }),
        _sleep: noopSleep,
      }),
    ).rejects.toThrow();
  });
});
