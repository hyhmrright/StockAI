import { describe, test, expect } from 'bun:test';
import { annualizeRoe } from './roe-annualize';

describe('annualizeRoe', () => {
  test('一季报 ×4', () => {
    expect(annualizeRoe(10.57, '一季报')).toBeCloseTo(42.28, 2);
  });

  test('中报 ×2', () => {
    expect(annualizeRoe(17.89, '中报')).toBeCloseTo(35.78, 2);
  });

  test('三季报 ×4/3', () => {
    expect(annualizeRoe(24.64, '三季报')).toBeCloseTo(32.85, 2);
  });

  test('年报原样返回（乘数 1）', () => {
    expect(annualizeRoe(32.53, '年报')).toBe(32.53);
  });

  test('未知/缺失报告期类型 → 原样返回（保守，不臆测）', () => {
    expect(annualizeRoe(18.5, undefined)).toBe(18.5);
    expect(annualizeRoe(18.5, '')).toBe(18.5);
    expect(annualizeRoe(18.5, '半年报快报')).toBe(18.5);
  });

  test('roe 为 undefined → 原样返回 undefined', () => {
    expect(annualizeRoe(undefined, '一季报')).toBeUndefined();
  });
});
