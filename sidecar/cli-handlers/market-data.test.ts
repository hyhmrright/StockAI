import { describe, it, expect, mock } from 'bun:test';
import { createHandlers } from './index';

describe('handleInfo', () => {
  it('空 symbol 应返回 ERR_MISSING_PARAM', async () => {
    const mockOut = mock(() => {});
    const handlers = createHandlers({ _out: mockOut });

    await handlers.handleInfo('');

    expect(mockOut).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }) }),
    );
  });
});

describe('handleFinancialHistory', () => {
  const mockHistory = {
    symbol: '600519',
    market: 'A股' as const,
    snapshots: [{ reportDate: '2026-03-31', reportType: '一季报', roe: 10.57 }],
    fetchedAt: 1,
  };

  it('空 symbol 返回 ERR_MISSING_PARAM 且不抓取', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => mockHistory);
    const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

    await handlers.handleFinancialHistory('');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockOut).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }) }),
    );
  });

  it('缺省 periods → 默认 12 期，输出成功信封', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => mockHistory);
    const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

    await handlers.handleFinancialHistory('600519');

    expect(mockFetch).toHaveBeenCalledWith('600519', 12);
    expect(mockOut).toHaveBeenCalledWith({ data: mockHistory });
  });

  it('periods 字符串被解析为整数传入', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => mockHistory);
    const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

    await handlers.handleFinancialHistory('600519', '8');

    expect(mockFetch).toHaveBeenCalledWith('600519', 8);
  });

  it('非法 periods 回退默认 12', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => mockHistory);
    const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

    await handlers.handleFinancialHistory('600519', 'abc');

    expect(mockFetch).toHaveBeenCalledWith('600519', 12);
  });

  it('抓取异常映射到 ERR_FIN_HISTORY', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => {
      throw new Error('东财 F10 历史 HTTP 500');
    });
    const handlers = createHandlers({ _out: mockOut, _fetchFinancialHistory: mockFetch });

    await handlers.handleFinancialHistory('600519');

    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_FIN_HISTORY' }),
    });
  });
});

describe('handleMarketSnapshot', () => {
  const mockSnapshot = {
    entries: [{ symbol: '600519', name: '贵州茅台', pe: 22.1, marketCap: 2_000_000_000_000 }],
    fetchedAt: 1,
    total: 1,
  };

  it('成功抓取返回 MarketSnapshot 信封', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => mockSnapshot);
    const handlers = createHandlers({ _out: mockOut, _fetchMarketSnapshot: mockFetch });

    await handlers.handleMarketSnapshot();

    expect(mockFetch).toHaveBeenCalled();
    expect(mockOut).toHaveBeenCalledWith({ data: mockSnapshot });
  });

  it('抓取异常映射到 ERR_MARKET_SNAPSHOT', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => {
      throw new Error('东财 clist HTTP 502');
    });
    const handlers = createHandlers({ _out: mockOut, _fetchMarketSnapshot: mockFetch });

    await handlers.handleMarketSnapshot();

    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_MARKET_SNAPSHOT' }),
    });
  });
});
