import { describe, test, expect } from 'bun:test';
import { ensureReportIndex, retrieveReportChunks, type ReportIndexDeps } from './index';
import type { ReportChunk } from '../../shared/types';

const SSE_CHUNK: ReportChunk = {
  text: '问：什么时候披露中报？\n答：预约披露时间是 8 月 15 日。',
  docTitle: '投资者互动问答',
  docDate: '2026-06-30',
  position: '问答 #1',
};

const IRM_CHUNK: ReportChunk = {
  text: '问：在建工程同比增长的原因？\n答：主要系产能扩建项目投入增加。',
  docTitle: '投资者互动问答',
  docDate: '2025-12-30',
  position: '问答 #1',
};

/** 内存缓存 + 全网络桩，保证测试完全 hermetic（不打网络、不落盘） */
function makeDeps(
  over: Partial<ReportIndexDeps> = {},
): ReportIndexDeps & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    resolveSseUidImpl: async () => '519',
    fetchSseFeedsImpl: async () => [SSE_CHUNK],
    resolveCompanyNameImpl: async () => '五粮液',
    searchIrmQaImpl: async () => [IRM_CHUNK],
    readCacheImpl: <T>(key: string) => (store.get(key) as T) ?? null,
    writeCacheImpl: <T>(key: string, value: T) => {
      store.set(key, value);
    },
    ...over,
  };
}

describe('ensureReportIndex', () => {
  test('沪市代码（6 开头）→ 走上证e互动（sse）路径', async () => {
    let sseCalled = false;
    let irmCalled = false;
    const deps = makeDeps({
      resolveSseUidImpl: async () => {
        sseCalled = true;
        return '519';
      },
      searchIrmQaImpl: async () => {
        irmCalled = true;
        return [];
      },
    });
    const index = await ensureReportIndex('600519', deps);
    expect(index).not.toBeNull();
    expect(index?.symbol).toBe('600519');
    expect(index?.chunks).toEqual([SSE_CHUNK]);
    expect(sseCalled).toBe(true);
    expect(irmCalled).toBe(false);
  });

  test('深市代码（非 6/9 开头）→ 走深交所互动易（irm）路径', async () => {
    let sseCalled = false;
    let irmCalled = false;
    const deps = makeDeps({
      resolveSseUidImpl: async () => {
        sseCalled = true;
        return '519';
      },
      searchIrmQaImpl: async (code, name) => {
        irmCalled = true;
        expect(code).toBe('000858');
        expect(name).toBe('五粮液');
        return [IRM_CHUNK];
      },
    });
    const index = await ensureReportIndex('000858', deps);
    expect(index).not.toBeNull();
    expect(index?.chunks).toEqual([IRM_CHUNK]);
    expect(sseCalled).toBe(false);
    expect(irmCalled).toBe(true);
  });

  test('非 A 股（AAPL）→ null，不触发任何抓取', async () => {
    let called = false;
    const deps = makeDeps({
      resolveSseUidImpl: async () => {
        called = true;
        return '519';
      },
      resolveCompanyNameImpl: async () => {
        called = true;
        return '五粮液';
      },
    });
    expect(await ensureReportIndex('AAPL', deps)).toBeNull();
    expect(called).toBe(false);
  });

  test('沪市 uid 解析失败 → null，不缓存', async () => {
    const deps = makeDeps({ resolveSseUidImpl: async () => null });
    expect(await ensureReportIndex('600519', deps)).toBeNull();
    expect(deps.store.size).toBe(0);
  });

  test('深市公司简称解析失败 → null，不缓存', async () => {
    const deps = makeDeps({ resolveCompanyNameImpl: async () => null });
    expect(await ensureReportIndex('000858', deps)).toBeNull();
    expect(deps.store.size).toBe(0);
  });

  test('零问答 → null，不缓存', async () => {
    const deps = makeDeps({ searchIrmQaImpl: async () => [] });
    expect(await ensureReportIndex('000858', deps)).toBeNull();
    expect(deps.store.size).toBe(0);
  });

  test('命中缓存 → 跳过全部抓取', async () => {
    const deps = makeDeps();
    await ensureReportIndex('000858', deps); // 建索引并写入 store
    let refetched = false;
    const deps2: ReportIndexDeps = {
      ...deps,
      resolveCompanyNameImpl: async () => {
        refetched = true;
        return '五粮液';
      },
    };
    const cached = await ensureReportIndex('000858', deps2);
    expect(cached).not.toBeNull();
    expect(refetched).toBe(false);
  });
});

describe('retrieveReportChunks', () => {
  test('相关追问 → 返回语义相关 chunk', async () => {
    const deps = makeDeps();
    const chunks = await retrieveReportChunks('000858', '在建工程同比增长的原因', 4, deps);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain('在建工程');
    expect(chunks[0].docTitle).toBe('投资者互动问答');
  });

  test('非 A 股 → []', async () => {
    expect(await retrieveReportChunks('AAPL', '营收', 4, makeDeps())).toEqual([]);
  });

  test('无索引（零问答）→ []', async () => {
    const deps = makeDeps({ searchIrmQaImpl: async () => [] });
    expect(await retrieveReportChunks('000858', '营收', 4, deps)).toEqual([]);
  });

  test('检索层抛异常 → 吞掉返回 []（永不阻断 chat）', async () => {
    const deps = makeDeps({
      resolveCompanyNameImpl: async () => {
        throw new Error('network down');
      },
    });
    expect(await retrieveReportChunks('000858', '营收', 4, deps)).toEqual([]);
  });

  test('不相关问题 → 无交集返回 []', async () => {
    const deps = makeDeps();
    const chunks = await retrieveReportChunks('000858', 'zzzz 无关英文 query', 4, deps);
    expect(chunks).toEqual([]);
  });
});
