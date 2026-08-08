import type { Language } from '../../shared/types';

/** Language → BCP 47 locale，供 toLocaleString / toLocaleDateString 使用 */
const LOCALE: Record<Language, string> = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
};

export function localeOf(language: Language): string {
  return LOCALE[language];
}

/**
 * 大数金额的分档单位。中日按万进制（万/亿/兆），英文按千进制（K/M/B/T）——
 * 这里差的是**分档阈值本身**而非仅标签，所以是一张按语言分的表，不是 i18n key。
 */
const BIG_UNITS: Record<Language, { threshold: number; unit: string }[]> = {
  zh: [
    { threshold: 1e12, unit: '万亿' },
    { threshold: 1e8, unit: '亿' },
    { threshold: 1e4, unit: '万' },
  ],
  ja: [
    { threshold: 1e12, unit: '兆' },
    { threshold: 1e8, unit: '億' },
    { threshold: 1e4, unit: '万' },
  ],
  en: [
    { threshold: 1e12, unit: 'T' },
    { threshold: 1e9, unit: 'B' },
    { threshold: 1e6, unit: 'M' },
    { threshold: 1e3, unit: 'K' },
  ],
};

/** 成交量/成交额/市值等大数的紧凑展示；不足最小档位时原样返回 */
export function formatBig(n: number | undefined, language: Language): string {
  if (n == null || isNaN(n)) return '—';
  for (const { threshold, unit } of BIG_UNITS[language]) {
    if (n >= threshold) return (n / threshold).toFixed(2) + unit;
  }
  return n.toString();
}

/** 固定小数位的本地化数字；空值统一显示为破折号 */
export function formatNumber(n: number | undefined, language: Language, digits = 2): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(localeOf(language), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
