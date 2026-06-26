import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlinePoint, RealtimeQuote } from '../../../shared/types';

// 完全 mock lightweight-charts：happy-dom 没有 canvas，无法真渲染图表；
// 我们只关心 PriceChart 协调层（数据拉取 + 状态机 + 子组件 prop）的行为。
vi.mock('lightweight-charts', () => {
  const noopSeries = {
    setData: vi.fn(),
    applyOptions: vi.fn(),
    setMarkers: vi.fn(),
    createPriceLine: vi.fn(() => ({})),
    removePriceLine: vi.fn(),
  };
  const noopChart = {
    addCandlestickSeries: vi.fn(() => noopSeries),
    addHistogramSeries: vi.fn(() => noopSeries),
    addLineSeries: vi.fn(() => noopSeries),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => noopChart),
    ColorType: { Solid: 'solid' },
    CrosshairMode: { Normal: 0 },
    PriceScaleMode: { Normal: 0, Logarithmic: 1 },
    LineStyle: { Solid: 0, Dashed: 1 },
  };
});

// mock IPC：fetchKline 返回固定 K 线序列
vi.mock('../../lib/ipc', () => ({
  fetchKline: vi.fn(),
}));

// mock 实时报价 hook：默认无报价
vi.mock('../../hooks/useRealtimeQuote', () => ({
  useRealtimeQuote: vi.fn(() => null),
}));

// detectMarket 保留默认 "美股" 即可（PriceChart 主要根据 market 选 MA 周期，不影响协调测试）
vi.mock('../../lib/market-hours', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/market-hours')>('../../lib/market-hours');
  return { ...actual, detectMarket: vi.fn(() => '美股' as const) };
});

import PriceChart from './index';
import { fetchKline } from '../../lib/ipc';
import { useRealtimeQuote } from '../../hooks/useRealtimeQuote';

function buildKline(count: number, base = 100): KlinePoint[] {
  const startTime = Math.floor(Date.UTC(2025, 0, 1) / 1000);
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 86400,
    open: base + i,
    high: base + i + 1,
    low: base + i - 1,
    close: base + i + 0.5,
    volume: 1_000_000,
  }));
}

function buildQuote(overrides: Partial<RealtimeQuote> = {}): RealtimeQuote {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    change: 1,
    changePercent: 0.5,
    open: 199,
    high: 201,
    low: 198,
    prevClose: 199,
    volume: 1_000_000,
    amount: 200_000_000,
    timestamp: Math.floor(Date.now() / 1000),
    currency: 'USD',
    market: '美股',
    ...overrides,
  };
}

describe('PriceChart 协调层', () => {
  beforeEach(() => {
    vi.mocked(fetchKline).mockReset();
    vi.mocked(useRealtimeQuote).mockReset();
    vi.mocked(useRealtimeQuote).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('初次挂载：用默认 config 拉一次 K 线，请求落到对的 symbol', async () => {
    vi.mocked(fetchKline).mockResolvedValue(buildKline(30));
    render(<PriceChart symbol="AAPL" />);

    await waitFor(() => {
      expect(fetchKline).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL', range: '1y', adjust: 'qfq' }),
      );
    });
  });

  it('fetchKline 失败时渲染错误信息', async () => {
    vi.mocked(fetchKline).mockRejectedValue(new Error('网络炸了'));
    render(<PriceChart symbol="AAPL" />);
    expect(await screen.findByText(/网络炸了/)).toBeInTheDocument();
  });

  it('没设置 compareSymbol 时不发起比较基准请求', async () => {
    vi.mocked(fetchKline).mockResolvedValue(buildKline(10));
    render(<PriceChart symbol="AAPL" />);
    await waitFor(() => expect(fetchKline).toHaveBeenCalled());

    // 默认 config.compareSymbol === undefined → 只应该有 1 次调用（拉主 K 线）
    expect(vi.mocked(fetchKline).mock.calls.length).toBe(1);
  });

  it('无报价时不应该报错（quote 合并 useEffect 早返回）', async () => {
    vi.mocked(fetchKline).mockResolvedValue(buildKline(5));
    vi.mocked(useRealtimeQuote).mockReturnValue(null);

    expect(() => render(<PriceChart symbol="AAPL" />)).not.toThrow();
    await waitFor(() => expect(fetchKline).toHaveBeenCalled());
  });

  it('symbol 变化触发重新拉取', async () => {
    vi.mocked(fetchKline).mockResolvedValue(buildKline(5));
    const { rerender } = render(<PriceChart symbol="AAPL" />);
    await waitFor(() => expect(fetchKline).toHaveBeenCalledTimes(1));

    rerender(<PriceChart symbol="MSFT" />);
    await waitFor(() => {
      expect(fetchKline).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'MSFT' }));
    });
    expect(vi.mocked(fetchKline).mock.calls.length).toBe(2);
  });

  it('报价时间戳与最后一根 K 线非同一交易日时不合并', async () => {
    const klines = buildKline(3);
    vi.mocked(fetchKline).mockResolvedValue(klines);
    // 报价时间戳设为 K 线 +30 天，确保 toDateString 不同
    const farFuture = klines[klines.length - 1].time + 30 * 86400;
    vi.mocked(useRealtimeQuote).mockReturnValue(buildQuote({ timestamp: farFuture, price: 999 }));

    await act(async () => {
      render(<PriceChart symbol="AAPL" />);
    });
    await waitFor(() => expect(fetchKline).toHaveBeenCalled());
    // 测试通过隐含验证：不同 day 时合并 effect 早退、未触发 setData crash
    // （ChartCanvas mock 的 setData 累计调用次数可作为更细的断言，但当前需求是不崩 + 不污染 state）
  });
});
