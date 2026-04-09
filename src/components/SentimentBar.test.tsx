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
    render(<SentimentBar bullish={60} />);

    const bullishBar = screen.getByTestId('bullish-bar');
    const bearishBar = screen.getByTestId('bearish-bar');

    expect(bullishBar).toHaveStyle({ width: '60%' });
    expect(bearishBar).toHaveStyle({ width: '40%' });
  });
});
