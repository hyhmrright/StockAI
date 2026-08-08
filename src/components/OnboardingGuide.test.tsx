import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OnboardingGuide } from './OnboardingGuide';

function renderGuide(isOpen = true) {
  const onConfigure = vi.fn();
  const onDismiss = vi.fn();
  render(<OnboardingGuide isOpen={isOpen} onConfigure={onConfigure} onDismiss={onDismiss} />);
  return { onConfigure, onDismiss };
}

describe('OnboardingGuide', () => {
  it('isOpen=false 时不渲染任何内容', () => {
    renderGuide(false);
    expect(screen.queryByText('欢迎使用 StockAI')).not.toBeInTheDocument();
  });

  it('isOpen=true 时显示标题与三个步骤', () => {
    renderGuide();
    expect(screen.getByText('欢迎使用 StockAI')).toBeInTheDocument();
    expect(screen.getByText(/配置 AI 提供商/)).toBeInTheDocument();
    expect(screen.getByText(/选一只股票/)).toBeInTheDocument();
    expect(screen.getByText(/开始 AI 分析/)).toBeInTheDocument();
  });

  it('点「去配置」触发 onConfigure', () => {
    const { onConfigure, onDismiss } = renderGuide();
    fireEvent.click(screen.getByText('去配置'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('点「稍后再说」触发 onDismiss', () => {
    const { onConfigure, onDismiss } = renderGuide();
    fireEvent.click(screen.getByText('稍后再说'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfigure).not.toHaveBeenCalled();
  });

  it('提示未配置时行情与量化同样不可用——不能只说 AI 不可用', () => {
    renderGuide();
    expect(screen.getByText(/行情与量化同样取不到数据/)).toBeInTheDocument();
  });
});
