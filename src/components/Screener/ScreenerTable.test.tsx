import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import ScreenerTable from './ScreenerTable';
import { useSettings } from '../../hooks/useSettings';
import type { Language } from '../../../shared/types';
import type { ScreenerResult } from '../../../shared/types';

// useLanguage 从 useSettings 取语言，这里直接换掉语言源即可驱动整棵子树切语言
vi.mock('../../hooks/useSettings', () => ({ useSettings: vi.fn() }));

function setLanguage(language: Language) {
  vi.mocked(useSettings).mockReturnValue({
    settings: { language },
    // biome-ignore lint/suspicious/noExplicitAny: 组件只读 settings.language，其余字段与本用例无关
  } as any);
}

const RESULTS = [
  {
    symbol: '600519',
    name: '贵州茅台',
    quant: {
      composite: { score: 82.5 },
      technical: { signal: 'bullish' },
      fundamental: { signal: 'bearish' },
      valuation: { signal: 'overvalued' },
      risk: { riskLevel: 'medium' },
    },
    // biome-ignore lint/suspicious/noExplicitAny: 精简夹具，只含表格实际读取的字段
  } as any as ScreenerResult,
];

describe('ScreenerTable · 语言切换', () => {
  beforeEach(() => vi.mocked(useSettings).mockReset());

  it('zh：表头与信号徽标均为中文', () => {
    setLanguage('zh');
    render(<ScreenerTable results={RESULTS} onSelect={vi.fn()} />);

    expect(screen.getByText('技术面')).toBeInTheDocument();
    expect(screen.getByText('风险')).toBeInTheDocument();
    expect(screen.getByText('看涨')).toBeInTheDocument();
    expect(screen.getByText('中风险')).toBeInTheDocument();
  });

  it('en：同一组数据渲染为英文，不残留中文', () => {
    setLanguage('en');
    const { container } = render(<ScreenerTable results={RESULTS} onSelect={vi.fn()} />);

    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    // 徽标此前直接渲染 'bullish' 原始枚举值，现已接入译文
    expect(screen.getByText('Bullish')).toBeInTheDocument();
    expect(screen.getByText('Overvalued')).toBeInTheDocument();

    // 股票名（数据本身）之外不应出现中文——这是本轮 i18n 补齐的核心断言
    const text = (container.textContent ?? '').replace('贵州茅台', '');
    expect(text).not.toMatch(/[一-龥]/);
  });

  it('ja：表头切换为日文', () => {
    setLanguage('ja');
    render(<ScreenerTable results={RESULTS} onSelect={vi.fn()} />);

    expect(screen.getByText('テクニカル')).toBeInTheDocument();
    expect(screen.getByText('リスク')).toBeInTheDocument();
  });

  it('空结果时按语言给出对应的空态文案', () => {
    setLanguage('en');
    render(<ScreenerTable results={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('No results yet')).toBeInTheDocument();
  });
});
