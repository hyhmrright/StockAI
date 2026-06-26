import { describe, it, expect } from 'vitest';
import {
  signalColor,
  signalLabel,
  signalBadge,
  sentimentBgClass,
  sentimentBadgeClass,
} from './signal-styles';

describe('signalColor', () => {
  it('bullish → emerald 样式', () => {
    expect(signalColor('bullish')).toContain('emerald');
  });
  it('bearish → rose 样式', () => {
    expect(signalColor('bearish')).toContain('rose');
  });
  it('neutral → amber 样式', () => {
    expect(signalColor('neutral')).toContain('amber');
  });
  it('未知值回退到 amber', () => {
    expect(signalColor('unknown')).toContain('amber');
  });
});

describe('signalLabel', () => {
  it('bullish → 看涨', () => {
    expect(signalLabel('bullish')).toBe('看涨');
  });
  it('bearish → 看跌', () => {
    expect(signalLabel('bearish')).toBe('看跌');
  });
  it('neutral → 中性', () => {
    expect(signalLabel('neutral')).toBe('中性');
  });
  it('未知值回退到 中性', () => {
    expect(signalLabel('garbage')).toBe('中性');
  });
});

describe('signalBadge', () => {
  it('bullish 返回正确 label 和 className', () => {
    const badge = signalBadge('bullish');
    expect(badge.label).toBe('看涨');
    expect(badge.className).toContain('emerald');
  });
  it('bearish 返回正确 label 和 className', () => {
    const badge = signalBadge('bearish');
    expect(badge.label).toBe('看跌');
    expect(badge.className).toContain('rose');
  });
  it('neutral 返回正确 label 和 className', () => {
    const badge = signalBadge('neutral');
    expect(badge.label).toBe('中性');
    expect(badge.className).toContain('amber');
  });
  it('未知值回退到中性 badge', () => {
    const badge = signalBadge('xyz');
    expect(badge.label).toBe('中性');
    expect(badge.className).toContain('amber');
  });
});

describe('sentimentBgClass', () => {
  it('bullish → bg-emerald-500', () => {
    expect(sentimentBgClass('bullish')).toBe('bg-emerald-500');
  });
  it('bearish → bg-rose-500', () => {
    expect(sentimentBgClass('bearish')).toBe('bg-rose-500');
  });
  it('neutral → bg-amber-500', () => {
    expect(sentimentBgClass('neutral')).toBe('bg-amber-500');
  });
});

describe('sentimentBadgeClass', () => {
  it('bullish → emerald 色 badge', () => {
    expect(sentimentBadgeClass('bullish')).toContain('emerald');
  });
  it('bearish → rose 色 badge', () => {
    expect(sentimentBadgeClass('bearish')).toContain('rose');
  });
  it('neutral → amber 色 badge', () => {
    expect(sentimentBadgeClass('neutral')).toContain('amber');
  });
});
