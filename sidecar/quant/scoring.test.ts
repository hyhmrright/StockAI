import { describe, test, expect } from 'bun:test';
import { computeComposite } from './scoring';
import type { AnalystSignal } from '../../shared/types';

describe('computeComposite', () => {
  test('两个 bullish 信号合成 bullish', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 75, details: {} };
    const fund: AnalystSignal = { signal: 'bullish', confidence: 60, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.signal).toBe('bullish');
    expect(result.score).toBeGreaterThan(60);
  });

  test('一个 bullish 一个 bearish 合成接近 neutral', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 70, details: {} };
    const fund: AnalystSignal = { signal: 'bearish', confidence: 70, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.score).toBeGreaterThan(35);
    expect(result.score).toBeLessThan(65);
  });

  test('两个 bearish 信号合成 bearish', () => {
    const tech: AnalystSignal = { signal: 'bearish', confidence: 80, details: {} };
    const fund: AnalystSignal = { signal: 'bearish', confidence: 65, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.signal).toBe('bearish');
    expect(result.score).toBeLessThan(40);
  });

  test('score 始终在 1-100 范围', () => {
    const extreme: AnalystSignal = { signal: 'bullish', confidence: 100, details: {} };
    const result = computeComposite(extreme, extreme);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
