import { describe, test, expect } from 'bun:test';
import { computeComposite } from './scoring';
import type { AnalystSignal, ValuationSnapshot, RiskSnapshot } from '../../shared/types';

const neutral: AnalystSignal = { signal: 'neutral', confidence: 50, details: {} };
function val(signal: ValuationSnapshot['signal'], confidence: number): ValuationSnapshot {
  return {
    intrinsicValue: null,
    marketCap: null,
    marginOfSafety: null,
    signal,
    confidence,
    models: {},
  };
}
function risk(riskLevel: RiskSnapshot['riskLevel']): RiskSnapshot {
  return {
    annualizedVolatility: 0.3,
    volatilityPercentile: 50,
    maxDrawdown: -0.2,
    sharpeProxy: 1,
    riskLevel,
  };
}

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

  test('向后兼容：2 参调用不带 breakdown，结果与历史口径一致', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 75, details: {} };
    const fund: AnalystSignal = { signal: 'bullish', confidence: 60, details: {} };
    const result = computeComposite(tech, fund);
    expect(result.breakdown).toBeUndefined();
    // 与未传 valuation/risk 时完全一致（零扰动）
    expect(computeComposite(tech, fund, null, null).score).toBe(result.score);
  });
});

describe('computeComposite 四维（估值 + 风险）', () => {
  test('低估上抬分数、高估下压、估值适中不动（基准为中性 50）', () => {
    const baseScore = computeComposite(neutral, neutral).score; // 50
    expect(computeComposite(neutral, neutral, val('undervalued', 100)).score).toBeGreaterThan(
      baseScore,
    );
    expect(computeComposite(neutral, neutral, val('overvalued', 100)).score).toBeLessThan(
      baseScore,
    );
    expect(computeComposite(neutral, neutral, val('fair', 100)).score).toBe(baseScore);
  });

  test('估值偏移按置信度缩放（高置信度移动更大）', () => {
    const lowConf = computeComposite(neutral, neutral, val('undervalued', 30)).score;
    const highConf = computeComposite(neutral, neutral, val('undervalued', 100)).score;
    expect(highConf).toBeGreaterThan(lowConf);
  });

  test('高风险把看涨分向中性 50 收敛（降低极端度）', () => {
    const tech: AnalystSignal = { signal: 'bullish', confidence: 90, details: {} };
    const fund: AnalystSignal = { signal: 'bullish', confidence: 80, details: {} };
    const low = computeComposite(tech, fund, null, risk('low')).score;
    const high = computeComposite(tech, fund, null, risk('high')).score;
    expect(high).toBeLessThan(low); // 看涨分被高风险拉低（向 50）
    expect(high).toBeGreaterThan(50);
  });

  test('高风险把看跌分向中性 50 抬升', () => {
    const tech: AnalystSignal = { signal: 'bearish', confidence: 90, details: {} };
    const fund: AnalystSignal = { signal: 'bearish', confidence: 80, details: {} };
    const low = computeComposite(tech, fund, null, risk('low')).score;
    const high = computeComposite(tech, fund, null, risk('high')).score;
    expect(high).toBeGreaterThan(low); // 看跌分被高风险抬高（向 50）
    expect(high).toBeLessThan(50);
  });

  test('breakdown 透明暴露各维贡献', () => {
    const r = computeComposite(neutral, neutral, val('undervalued', 80), risk('high'));
    expect(r.breakdown).toBeDefined();
    expect(r.breakdown!.technical).toBe(50);
    expect(r.breakdown!.fundamental).toBe(50);
    expect(r.breakdown!.valuation).toBe(62); // 50 + 0.8*15
    expect(r.breakdown!.riskPull).toBe(0.85);
  });

  test('中/低风险 riskPull=1（不收敛）', () => {
    expect(computeComposite(neutral, neutral, null, risk('medium')).breakdown!.riskPull).toBe(1);
    expect(computeComposite(neutral, neutral, null, risk('low')).breakdown!.riskPull).toBe(1);
  });
});
