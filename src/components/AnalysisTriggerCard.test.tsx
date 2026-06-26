import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import AnalysisTriggerCard, { formatRelative } from './AnalysisTriggerCard';
import type { AIAnalysisRecord } from '../hooks/useAIAnalysis';

// ---- formatRelative 纯函数单测 ----

describe('formatRelative', () => {
  it("不到 60 秒显示'刚刚'", () => {
    expect(formatRelative(Date.now() - 30_000)).toBe('刚刚');
  });

  it("60 秒到 59 分钟显示'x 分钟前'", () => {
    expect(formatRelative(Date.now() - 5 * 60_000)).toBe('5 分钟前');
  });

  it("1 小时到 23 小时显示'x 小时前'", () => {
    expect(formatRelative(Date.now() - 3 * 3600_000)).toBe('3 小时前');
  });

  it("24 小时以上显示'x 天前'", () => {
    expect(formatRelative(Date.now() - 2 * 86400_000)).toBe('2 天前');
  });

  it("刚好 0 秒差显示'刚刚'", () => {
    expect(formatRelative(Date.now())).toBe('刚刚');
  });
});

// ---- AnalysisTriggerCard 组件测试 ----

const defaultProps = {
  analyzing: false,
  hasNews: true,
  record: null as AIAnalysisRecord | null,
  error: null as string | null,
  providerLabel: 'OpenAI',
  modelLabel: 'GPT-4',
  onAnalyze: vi.fn(),
};

function renderCard(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, onAnalyze: vi.fn(), ...overrides };
  return { ...render(<AnalysisTriggerCard {...props} />), onAnalyze: props.onAnalyze };
}

describe('AnalysisTriggerCard', () => {
  it("无 record 时显示'开始 AI 分析'按钮", () => {
    renderCard({ record: null });
    expect(screen.getByText('开始 AI 分析')).toBeInTheDocument();
  });

  it("有 record 时显示'重新 AI 分析'按钮", () => {
    const record: AIAnalysisRecord = {
      result: { rating: 80, sentiment: 'bullish', summary: 's', pros: [], cons: [] },
      analyzedAt: Date.now() - 60_000,
      newsSnapshotLength: 5,
    };
    renderCard({ record });
    expect(screen.getByText('重新 AI 分析')).toBeInTheDocument();
  });

  it('hasNews=false 时按钮被禁用', () => {
    renderCard({ hasNews: false });
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('hasNews=false 时显示等待提示', () => {
    renderCard({ hasNews: false });
    expect(screen.getByText(/等待新闻数据/)).toBeInTheDocument();
  });

  it('hasNews=true 时按钮可点击并触发 onAnalyze', () => {
    const { onAnalyze } = renderCard({ hasNews: true });
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('error 不为空时显示错误信息', () => {
    renderCard({ error: 'API Key 无效' });
    expect(screen.getByText('API Key 无效')).toBeInTheDocument();
  });

  it('error 为 null 时不渲染错误区域', () => {
    renderCard({ error: null });
    expect(screen.queryByText('API Key 无效')).not.toBeInTheDocument();
  });

  it('analyzing=true 时显示加载旋转器和分析文案', () => {
    renderCard({ analyzing: true });
    expect(screen.getByText(/正在分析/)).toBeInTheDocument();
    // 分析中不应出现按钮
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('analyzing=true 时显示模型名称', () => {
    renderCard({ analyzing: true, modelLabel: 'DeepSeek-V3' });
    expect(screen.getByText(/DeepSeek-V3 正在分析/)).toBeInTheDocument();
  });

  it('有 record 且非 analyzing 时显示上次分析信息', () => {
    const record: AIAnalysisRecord = {
      result: { rating: 70, sentiment: 'neutral', summary: 's', pros: [], cons: [] },
      analyzedAt: Date.now() - 120_000,
      newsSnapshotLength: 8,
    };
    renderCard({ record });
    expect(screen.getByText(/上次分析/)).toBeInTheDocument();
    expect(screen.getByText(/8 条新闻/)).toBeInTheDocument();
  });

  it('显示 provider 和 model 标签', () => {
    renderCard({ providerLabel: 'DeepSeek', modelLabel: 'V3' });
    expect(screen.getByText(/DeepSeek/)).toBeInTheDocument();
    expect(screen.getByText(/V3/)).toBeInTheDocument();
  });
});
