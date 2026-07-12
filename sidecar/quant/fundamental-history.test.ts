import { describe, test, expect } from 'bun:test';
import {
  parseEastmoneyFinancialHistory,
  buildF10HistoryUrl,
  fetchFinancialHistory,
  type FinancialHistoryDeps,
} from './fundamental-history';
import type { FinancialHistory } from '../../shared/types';

// 真实东财 F10 响应形态（curl 实测截取，数据在 result.data，日期带 " 00:00:00"）
const F10_FIXTURE = {
  version: 'x',
  result: {
    pages: 51,
    count: 102,
    data: [
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2026-03-31 00:00:00',
        REPORT_TYPE: '一季报',
        ROEJQ: 10.57,
        XSMLL: 91.2,
        XSJLL: 52.3,
        ZCFZL: 18.5,
        LD: 4.9,
        TOTALOPERATEREVETZ: 10.7,
        PARENTNETPROFITTZ: 12.3,
        TOTALOPERATEREVE: 51443000000,
        PARENTNETPROFIT: 26847000000,
        EPSJB: 21.36,
        BPS: 210.5,
        MGJYXJJE: 15.2,
      },
      {
        SECURITY_CODE: '600519',
        REPORT_DATE: '2025-12-31 00:00:00',
        REPORT_TYPE: '年报',
        ROEJQ: 32.53,
        XSMLL: 91.5,
        // 缺失字段（NETMARGIN/CFO）应省略为 undefined
        ZCFZL: 20.1,
        TOTALOPERATEREVETZ: 15.8,
        PARENTNETPROFITTZ: 16.2,
        EPSJB: 68.5,
        BPS: 195.3,
      },
    ],
  },
  success: true,
  message: 'ok',
  code: 0,
};

describe('parseEastmoneyFinancialHistory', () => {
  test('字段映射 + reportDate 裁剪到 10 位 + 源降序原样保留', () => {
    const snaps = parseEastmoneyFinancialHistory(F10_FIXTURE);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].reportDate).toBe('2026-03-31'); // " 00:00:00" 被裁掉
    expect(snaps[0].reportType).toBe('一季报');
    expect(snaps[0].roe).toBe(10.57);
    expect(snaps[0].grossMargin).toBe(91.2);
    expect(snaps[0].netMargin).toBe(52.3);
    expect(snaps[0].debtToAsset).toBe(18.5);
    expect(snaps[0].currentRatio).toBe(4.9);
    expect(snaps[0].revenueGrowth).toBe(10.7);
    expect(snaps[0].netIncomeGrowth).toBe(12.3);
    expect(snaps[0].revenue).toBe(51443000000);
    expect(snaps[0].netIncome).toBe(26847000000);
    expect(snaps[0].eps).toBe(21.36);
    expect(snaps[0].bps).toBe(210.5);
    expect(snaps[0].operatingCashFlowPerShare).toBe(15.2);
    // 降序：最新报告期在前
    expect(snaps[1].reportDate).toBe('2025-12-31');
  });

  test('缺失字段省略为 undefined（不注入 0）', () => {
    const snaps = parseEastmoneyFinancialHistory(F10_FIXTURE);
    expect(snaps[1].netMargin).toBeUndefined();
    expect(snaps[1].operatingCashFlowPerShare).toBeUndefined();
    expect(snaps[1].revenue).toBeUndefined();
  });

  test('success:false（字段名失效）→ 空数组', () => {
    const snaps = parseEastmoneyFinancialHistory({
      result: null,
      success: false,
      message: 'WEIGHTAVG_ROE返回字段不存在',
    });
    expect(snaps).toEqual([]);
  });

  test('无数据 / 非数组 → 空数组', () => {
    expect(parseEastmoneyFinancialHistory({ result: { data: [] } })).toEqual([]);
    expect(parseEastmoneyFinancialHistory({})).toEqual([]);
    expect(parseEastmoneyFinancialHistory({ result: null })).toEqual([]);
  });

  test('无 REPORT_DATE 的脏行被过滤', () => {
    const snaps = parseEastmoneyFinancialHistory({
      success: true,
      result: { data: [{ ROEJQ: 5 }, { REPORT_DATE: '2024-12-31 00:00:00', ROEJQ: 6 }] },
    });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].roe).toBe(6);
  });
});

describe('buildF10HistoryUrl', () => {
  test('用新字段名（ROEJQ，非 WEIGHTAVG_ROE）、pageSize=periods、编码 filter', () => {
    const url = buildF10HistoryUrl('600519', 12);
    expect(url).toContain('RPT_F10_FINANCE_MAINFINADATA');
    expect(url).toContain('ROEJQ');
    expect(url).not.toContain('WEIGHTAVG_ROE');
    expect(url).not.toContain('LD_RATIO');
    expect(url).toContain('pageSize=12');
    expect(url).toContain(encodeURIComponent('(SECURITY_CODE="600519")'));
    expect(url).toContain('sortColumns=REPORT_DATE&sortTypes=-1');
  });
});

describe('fetchFinancialHistory（DI mock fetch，离线）', () => {
  function stubDeps(): {
    deps: FinancialHistoryDeps;
    urls: string[];
    written: FinancialHistory[];
  } {
    const urls: string[] = [];
    const written: FinancialHistory[] = [];
    const deps: FinancialHistoryDeps = {
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return new Response(JSON.stringify(F10_FIXTURE), { status: 200 });
      }) as unknown as typeof fetch,
      readCacheImpl: () => null,
      writeCacheImpl: ((_k, v) => {
        written.push(v as FinancialHistory);
      }) as FinancialHistoryDeps['writeCacheImpl'],
    };
    return { deps, urls, written };
  }

  test('A 股：产出 FinancialHistory 形态，命中数据写缓存', async () => {
    const { deps, urls, written } = stubDeps();
    const hist = await fetchFinancialHistory('600519', 12, deps);

    expect(hist.symbol).toBe('600519');
    expect(hist.market).toBe('A股');
    expect(hist.snapshots).toHaveLength(2);
    expect(hist.snapshots[0].roe).toBe(10.57);
    expect(typeof hist.fetchedAt).toBe('number');
    expect(urls[0]).toContain('pageSize=12');
    expect(written).toHaveLength(1);
  });

  test('非 A 股（AAPL）→ 空时序，不发起请求', async () => {
    const { deps, urls } = stubDeps();
    const hist = await fetchFinancialHistory('AAPL', 12, deps);
    expect(hist.market).not.toBe('A股');
    expect(hist.snapshots).toEqual([]);
    expect(urls).toHaveLength(0);
  });

  test('缓存命中直接返回，不发起请求', async () => {
    const cached: FinancialHistory = {
      symbol: '600519',
      market: 'A股',
      snapshots: [],
      fetchedAt: 42,
    };
    const urls: string[] = [];
    const hist = await fetchFinancialHistory('600519', 12, {
      readCacheImpl: () => cached,
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return new Response('{}');
      }) as unknown as typeof fetch,
    });
    expect(hist).toBe(cached);
    expect(urls).toHaveLength(0);
  });

  test('空结果不写缓存（避免缓存偶发空数据 24h）', async () => {
    const written: FinancialHistory[] = [];
    const hist = await fetchFinancialHistory('600519', 12, {
      readCacheImpl: () => null,
      writeCacheImpl: ((_k, v) => {
        written.push(v as FinancialHistory);
      }) as FinancialHistoryDeps['writeCacheImpl'],
      fetchImpl: (async () =>
        new Response(JSON.stringify({ success: false, result: null }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    expect(hist.snapshots).toEqual([]);
    expect(written).toHaveLength(0);
  });

  test('HTTP 非 2xx 抛出（交上层 handler 包错误信封）', async () => {
    await expect(
      fetchFinancialHistory('600519', 12, {
        readCacheImpl: () => null,
        fetchImpl: (async () => new Response('bad', { status: 500 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('500');
  });
});
