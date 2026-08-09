import { describe, it, expect } from 'vitest';
import { localeOf, formatBig, formatNumber } from './locale';

describe('localeOf', () => {
  it('三语各自映射到 BCP 47', () => {
    expect(localeOf('zh')).toBe('zh-CN');
    expect(localeOf('en')).toBe('en-US');
    expect(localeOf('ja')).toBe('ja-JP');
  });
});

describe('formatBig', () => {
  /**
   * 中日按万进制、英文按千进制——差的是**分档阈值本身**而不只是标签。
   * 同一个数在三语下落在不同档位，这正是这张表最容易被改坏的地方。
   */
  it('中文按 万/亿/万亿 分档', () => {
    expect(formatBig(12_345, 'zh')).toBe('1.23万');
    expect(formatBig(2_823_992_576, 'zh')).toBe('28.24亿');
    expect(formatBig(2_683_739_110_000, 'zh')).toBe('2.68万亿');
  });

  it('日文同为万进制但用 億/兆 字形', () => {
    expect(formatBig(12_345, 'ja')).toBe('1.23万');
    expect(formatBig(2_823_992_576, 'ja')).toBe('28.24億');
    expect(formatBig(2_683_739_110_000, 'ja')).toBe('2.68兆');
  });

  it('英文按千进制 K/M/B/T——同一个数落在不同档位', () => {
    expect(formatBig(1234, 'en')).toBe('1.23K');
    expect(formatBig(2_823_992_576, 'en')).toBe('2.82B');
    expect(formatBig(2_683_739_110_000, 'en')).toBe('2.68T');
    // 中文这一档还没进「万」，英文已经是 K 了
    expect(formatBig(1234, 'zh')).toBe('1234');
  });

  it('不足最小档位时原样返回', () => {
    expect(formatBig(999, 'zh')).toBe('999');
    expect(formatBig(0, 'en')).toBe('0');
  });

  it('空值与 NaN 统一显示破折号', () => {
    expect(formatBig(undefined, 'zh')).toBe('—');
    expect(formatBig(NaN, 'en')).toBe('—');
  });

  /**
   * 分档要看**绝对值**。资金净额、涨跌额这类带符号的量一半时间是负的，
   * 若按 `n >= threshold` 判断则一档都进不去，会退化成一串十位裸数字
   * ——而它正上方的正数邻居显示为「28.24亿」，并排看根本读不出量级。
   * 同目录的 `components/Market/format.ts` 早就是这么做的。
   */
  it('负数按绝对值分档，与正数同档', () => {
    expect(formatBig(-2_823_992_576, 'zh')).toBe('-28.24亿');
    expect(formatBig(-2_823_992_576, 'en')).toBe('-2.82B');
    expect(formatBig(-12_345, 'ja')).toBe('-1.23万');
    expect(formatBig(-999, 'zh')).toBe('-999');
  });
});

describe('formatNumber', () => {
  it('默认两位小数并按语言加千分位', () => {
    expect(formatNumber(1234.567, 'zh')).toBe('1,234.57');
    expect(formatNumber(1234.567, 'en')).toBe('1,234.57');
  });

  it('digits 可指定小数位，且做四舍五入', () => {
    expect(formatNumber(1234.567, 'en', 0)).toBe('1,235');
  });

  it('空值与 NaN 统一显示破折号', () => {
    expect(formatNumber(undefined, 'ja')).toBe('—');
    expect(formatNumber(NaN, 'zh')).toBe('—');
  });
});
