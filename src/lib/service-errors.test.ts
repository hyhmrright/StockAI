import { describe, it, expect } from 'vitest';
import { ServiceError } from './ipc';
import { formatServiceError, serviceErrorKey } from './service-errors';
import zh from '../i18n/zh.json';
import en from '../i18n/en.json';
import ja from '../i18n/ja.json';
import type { TranslationKey } from '../i18n';

/** 最小 t：只做 zh 查表 + {var} 插值，与 useLanguage 的实现同口径 */
const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
  let s: string = zh[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
};

describe('serviceErrorKey', () => {
  it('已登记的 code 返回对应 i18n key', () => {
    expect(serviceErrorKey(new ServiceError('ERR_SCRAPE_EMPTY', 'x'))).toBe('err_scrape_empty');
  });

  it('未登记的 code 返回 null', () => {
    expect(serviceErrorKey(new ServiceError('ERR_NEVER_HEARD_OF', 'x'))).toBeNull();
  });

  it('非 ServiceError 返回 null', () => {
    expect(serviceErrorKey(new Error('boom'))).toBeNull();
    expect(serviceErrorKey('boom')).toBeNull();
  });
});

describe('formatServiceError', () => {
  it('带 {message} 的译文接上原始诊断', () => {
    const err = new ServiceError('ERR_ANALYSIS_FAILED', '401 Unauthorized');
    expect(formatServiceError(err, t, 'data_fetch_error')).toContain('401 Unauthorized');
  });

  it('不带 {message} 的译文不泄漏 sidecar 原文', () => {
    const err = new ServiceError('ERR_SCRAPE_EMPTY', '所有策略均未返回新闻');
    expect(formatServiceError(err, t, 'data_fetch_error')).not.toContain('所有策略');
  });

  it('未登记的 code 退到调用方兜底 key，而不是裸 message', () => {
    const err = new ServiceError('ERR_NEVER_HEARD_OF', '不可翻译的原文');
    const out = formatServiceError(err, t, 'data_fetch_error');
    expect(out).toBe(zh.data_fetch_error);
    expect(out).not.toContain('不可翻译的原文');
  });

  it('裸 Error 同样走兜底 key', () => {
    expect(formatServiceError(new Error('raw'), t, 'quant_error')).toBe(zh.quant_error);
  });
});

describe('三语 locale 一致性', () => {
  // TranslationKey 由 zh.json 推导，编译器只能保证「用到的 key 在 zh 里有」，
  // 管不到 en/ja 缺 key（运行期回落成 key 字面量上屏）或多出废 key。
  const zhKeys = Object.keys(zh).sort();

  it.each([
    ['en', en],
    ['ja', ja],
  ])('%s 的 key 集合与 zh 完全一致', (_name, locale) => {
    expect(Object.keys(locale).sort()).toEqual(zhKeys);
  });

  // 只查 en：中文出现在英文文案里必是漏翻。ja 查不了——「保存」「上限」「高速」等
  // 日文汉字与中文同形，逐字相同恰恰是正确翻译，查了只会得到一串误报。
  it('en 没有漏翻（值里仍带中文）', () => {
    const untranslated = zhKeys.filter((k) => /[一-龥]/.test(en[k as keyof typeof en]));
    expect(untranslated).toEqual([]);
  });
});
