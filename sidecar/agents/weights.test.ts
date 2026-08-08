import { describe, test, expect } from 'bun:test';
import { computeMasterWeights, MIN_SAMPLE, WEIGHT_MIN, WEIGHT_MAX } from './weights';
import type { MasterWeightInput } from '../../shared/types';

const w = (masterId: string, sampleSize: number, hits: number): MasterWeightInput => ({
  masterId,
  sampleSize,
  hits,
});

describe('computeMasterWeights — 防线 1（最小样本阈值）', () => {
  test('新大师 3 次全对 → 不入 Map（消费端默认 1.0）', () => {
    const m = computeMasterWeights([w('rookie', 3, 3)]);
    expect(m.has('rookie')).toBe(false);
  });

  test('恰好 MIN_SAMPLE-1 样本 → 仍不入 Map', () => {
    const m = computeMasterWeights([w('x', MIN_SAMPLE - 1, MIN_SAMPLE - 1)]);
    expect(m.has('x')).toBe(false);
  });

  test('恰好达 MIN_SAMPLE → 入 Map', () => {
    const m = computeMasterWeights([w('x', MIN_SAMPLE, MIN_SAMPLE)]);
    expect(m.has('x')).toBe(true);
  });

  test('空输入 → 空 Map', () => {
    expect(computeMasterWeights([]).size).toBe(0);
  });
});

describe('computeMasterWeights — 防线 2（贝叶斯收缩，方向 + 压制强度）', () => {
  test('n=6 h=6 刚过阈值 → 收缩到 ~1.1875，远低于朴素 1.5', () => {
    const m = computeMasterWeights([w('d', 6, 6)]);
    const weight = m.get('d')!.weight;
    // shrunk=(6+5)/16=0.6875 → 1+0.1875=1.1875
    expect(weight).toBeCloseTo(1.1875, 4);
    expect(weight).toBeLessThanOrEqual(1.2); // §8-2：远低于朴素 1.5
  });

  test('n=30 h=30 长期完美 → ~1.375（仍被收缩，未顶格）', () => {
    const weight = computeMasterWeights([w('a', 30, 30)]).get('a')!.weight;
    // shrunk=(30+5)/40=0.875 → 1.375
    expect(weight).toBeCloseTo(1.375, 4);
    expect(weight).toBeLessThan(WEIGHT_MAX);
  });

  test('n=30 h=24（h0.8 强）→ ~1.225，看涨大师 > 1', () => {
    const weight = computeMasterWeights([w('a', 30, 24)]).get('a')!.weight;
    // shrunk=29/40=0.725 → 1.225
    expect(weight).toBeCloseTo(1.225, 4);
    expect(weight).toBeGreaterThan(1);
  });

  test('n=30 h=6（h0.2 弱）→ ~0.775，看跌大师 < 1', () => {
    const weight = computeMasterWeights([w('b', 30, 6)]).get('b')!.weight;
    // shrunk=11/40=0.275 → 0.775
    expect(weight).toBeCloseTo(0.775, 4);
    expect(weight).toBeLessThan(1);
  });

  test('样本越大越逼近真实命中率：同为 h0.8，n 越大权重越偏离 1', () => {
    const small = computeMasterWeights([w('a', 10, 8)]).get('a')!.weight;
    const large = computeMasterWeights([w('a', 100, 80)]).get('a')!.weight;
    expect(large).toBeGreaterThan(small); // 大样本更接近真实 0.8，权重更高
  });
});

describe('computeMasterWeights — 平滑抗跳变（§8-3）', () => {
  test('单次错判扰动 (n20 12hit → n21 12hit) → |Δweight| < 0.05', () => {
    const before = computeMasterWeights([w('m', 20, 12)]).get('m')!.weight;
    const after = computeMasterWeights([w('m', 21, 12)]).get('m')!.weight;
    expect(Math.abs(after - before)).toBeLessThan(0.05);
  });

  test('单次命中扰动 (n20 12hit → n21 13hit) → 同样小幅移动，不剧烈跳变', () => {
    const before = computeMasterWeights([w('m', 20, 12)]).get('m')!.weight;
    const after = computeMasterWeights([w('m', 21, 13)]).get('m')!.weight;
    expect(Math.abs(after - before)).toBeLessThan(0.05);
  });
});

describe('computeMasterWeights — 防线 3（钳位守边界）', () => {
  // 当前常量下收缩后 shrunk 严格落在 (0,1)，权重天然落在 (0.505, 1.495)，钳位是防御性护栏
  // （防 SENSITIVITY 调大或未来改动越界）；此处验证任何极端输入都不越 [MIN, MAX] 不变量。
  test('极端 h=1 大样本 → 逼近但不越 WEIGHT_MAX', () => {
    const weight = computeMasterWeights([w('a', 1000, 1000)]).get('a')!.weight;
    expect(weight).toBeLessThanOrEqual(WEIGHT_MAX);
    expect(weight).toBeGreaterThan(1.49);
  });

  test('极端 h=0 大样本 → 逼近但不越 WEIGHT_MIN', () => {
    const weight = computeMasterWeights([w('b', 1000, 0)]).get('b')!.weight;
    expect(weight).toBeGreaterThanOrEqual(WEIGHT_MIN);
    expect(weight).toBeLessThan(0.51);
  });
});

describe('computeMasterWeights — 元数据与验收组合（§8-1）', () => {
  test('hitRate = hits/sampleSize（无 rounding 分歧）', () => {
    const e = computeMasterWeights([w('a', 30, 24)]).get('a')!;
    expect(e.hitRate).toBe(24 / 30);
  });

  test('§8-1：A(n30 h24) 与 B(n30 h6) → weight(A) > 1 > weight(B)，均在钳位内', () => {
    const m = computeMasterWeights([w('A', 30, 24), w('B', 30, 6)]);
    const a = m.get('A')!.weight;
    const b = m.get('B')!.weight;
    expect(a).toBeGreaterThan(1);
    expect(b).toBeLessThan(1);
    expect(a).toBeLessThan(WEIGHT_MAX);
    expect(b).toBeGreaterThan(WEIGHT_MIN);
  });
});
