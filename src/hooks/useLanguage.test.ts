import { describe, test, expect } from 'vitest';
import { getTranslations } from '../i18n';

describe('getTranslations', () => {
  test('zh returns Chinese strings', () => {
    const t = getTranslations('zh');
    expect(t.bullish).toBe('看涨');
    expect(t.bearish).toBe('看跌');
    expect(t.neutral).toBe('中性');
  });

  test('en returns English strings', () => {
    const t = getTranslations('en');
    expect(t.bullish).toBe('Bullish');
    expect(t.bearish).toBe('Bearish');
    expect(t.neutral).toBe('Neutral');
  });

  test('ja returns Japanese strings', () => {
    const t = getTranslations('ja');
    expect(t.bullish).toBe('強気');
    expect(t.bearish).toBe('弱気');
    expect(t.neutral).toBe('中立');
  });

  test('en has all zh keys', () => {
    const zh = getTranslations('zh');
    const en = getTranslations('en');
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(en[key]).toBeDefined();
    }
  });

  test('ja has all zh keys', () => {
    const zh = getTranslations('zh');
    const ja = getTranslations('ja');
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(ja[key]).toBeDefined();
    }
  });
});
