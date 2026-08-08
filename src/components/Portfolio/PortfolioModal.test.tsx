import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { buildOverview } from '../../lib/portfolio';
import type { Position, RealtimeQuote } from '../../../shared/types';

const { usePortfolio } = vi.hoisted(() => ({ usePortfolio: vi.fn() }));
vi.mock('../../hooks/usePortfolio', () => ({ usePortfolio }));

import PortfolioModal from './PortfolioModal';

/**
 * 这个弹窗按需挂载，e2e 冒烟不会打开它——不在这里渲染一次，整块 UI 就从未被执行过。
 * 断言用真实的 buildOverview 产物而不是手捏的估值对象：手捏会把"计算层与展示层
 * 是否对得上"这件事一并假设掉。
 */
function pos(symbol: string, shares: number, costPrice: number, id: number): Position {
  return { id, symbol, shares, costPrice, openedAt: 0 };
}

function quote(symbol: string, price: number, currency: 'CNY' | 'USD'): RealtimeQuote {
  return {
    symbol,
    name: symbol,
    price,
    change: 0,
    changePercent: 0,
    open: price,
    high: price,
    low: price,
    prevClose: price,
    volume: 0,
    amount: 0,
    timestamp: 0,
    currency,
    market: currency === 'CNY' ? 'A股' : '美股',
  };
}

function mockPortfolio(positions: Position[], quotes: Record<string, RealtimeQuote>) {
  usePortfolio.mockReturnValue({
    positions,
    overview: buildOverview(positions, quotes),
    loading: false,
    error: null,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  });
}

beforeEach(() => usePortfolio.mockReset());

describe('PortfolioModal', () => {
  it('空持仓时渲染空态而不是崩', () => {
    mockPortfolio([], {});
    render(<PortfolioModal onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText(/还没有持仓记录/)).toBeInTheDocument();
  });

  it('渲染逐笔明细与浮动盈亏', () => {
    mockPortfolio([pos('AAPL', 100, 150, 1)], { AAPL: quote('AAPL', 180, 'USD') });
    render(<PortfolioModal onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
    expect(screen.getByText(/\+3,000/)).toBeInTheDocument(); // (180-150)×100
    expect(screen.getByText(/\+20\.00%/)).toBeInTheDocument();
  });

  it('两个币种各出一张汇总卡，并给出不合并的说明', () => {
    mockPortfolio([pos('600519', 100, 1600, 1), pos('AAPL', 10, 150, 2)], {
      '600519': quote('600519', 1700, 'CNY'),
      AAPL: quote('AAPL', 180, 'USD'),
    });
    render(<PortfolioModal onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByText('CNY')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText(/没有汇率数据源/)).toBeInTheDocument();
  });

  it('取不到价的标的被点名，用户才知道汇总少算了什么', () => {
    mockPortfolio([pos('AAPL', 100, 150, 1), pos('DEAD', 1, 1, 2)], {
      AAPL: quote('AAPL', 180, 'USD'),
    });
    render(<PortfolioModal onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByText(/DEAD.*未计入/)).toBeInTheDocument();
  });
});
