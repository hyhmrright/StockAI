import React from 'react';
import { render, screen } from '@testing-library/react';
import SentimentBar from './SentimentBar';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('SentimentBar Component', () => {
  it('应该正确渲染看涨和看跌百分比', () => {
    render(<SentimentBar bullish={75} />);
    
    expect(screen.getByText('看涨 75%')).toBeInTheDocument();
    expect(screen.getByText('看跌 25%')).toBeInTheDocument();
  });

  it('进度条宽度应该反映百分比', () => {
    const { container } = render(<SentimentBar bullish={60} />);
    
    // 查找代表看涨部分的 div
    const bars = container.querySelectorAll('.bg-emerald-500');
    expect(bars.length).toBe(1);
    expect(bars[0]).toHaveStyle({ width: '60%' });

    // 查找代表看跌部分的 div
    const bearishBars = container.querySelectorAll('.bg-rose-500');
    expect(bearishBars.length).toBe(1);
    expect(bearishBars[0]).toHaveStyle({ width: '40%' });
  });
});
