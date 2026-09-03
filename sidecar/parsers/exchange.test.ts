import { expect, test, describe } from 'bun:test';
import { detectChinaStock, parseSymbol } from './exchange';

describe('detectChinaStock', () => {
  test('6 开头识别为上交所', () => {
    const result = detectChinaStock('601012');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('601012');
    expect(result!.googleSuffix).toBe('SHA');
    expect(result!.yahooSuffix).toBe('.SS');
  });

  test('0 开头识别为深交所', () => {
    const result = detectChinaStock('000001');
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe('SZE');
    expect(result!.yahooSuffix).toBe('.SZ');
  });

  test('3 开头识别为深交所（创业板）', () => {
    const result = detectChinaStock('300750');
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe('SZE');
  });

  test('4 开头识别为北交所', () => {
    const result = detectChinaStock('430047');
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe('BJS');
    expect(result!.yahooSuffix).toBe('.BJ');
  });

  test('8 开头识别为北交所', () => {
    const result = detectChinaStock('830799');
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe('BJS');
  });

  // 920 是北交所 2024 年启用的新号段，东财北交所板块头部已基本被它占满
  // （实测 m:0 t:81 s:2048 前 5 只全是 920xxx）。漏认会让这些股票落进美股链路取不到数据。
  test('920 开头识别为北交所', () => {
    const result = detectChinaStock('920008');
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe('BJS');
    expect(result!.sinaPrefix).toBe('bj');
  });

  // 900 是沪 B 股，与 920 只差一位但归属上交所——不能按「9 开头即北交所」放行
  test('900 开头（沪 B）不误判为北交所', () => {
    expect(detectChinaStock('900901')?.googleSuffix).not.toBe('BJS');
  });

  test('纯英文代码返回 null（非 A 股）', () => {
    expect(detectChinaStock('AAPL')).toBeNull();
    expect(detectChinaStock('TSLA')).toBeNull();
  });

  test('包含中文名的 A 股代码能正确提取', () => {
    const result = detectChinaStock('隆基绿能601012');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('601012');
    expect(result!.googleSuffix).toBe('SHA');
  });

  test('不含 6 位数字的字符串返回 null', () => {
    expect(detectChinaStock('12345')).toBeNull();
    expect(detectChinaStock('')).toBeNull();
  });

  test('首位为非 A 股代码段的 6 位数字返回 null', () => {
    // 以 1/2/9 等开头的 6 位代码不属于任何已知交易所
    expect(detectChinaStock('100001')).toBeNull();
    expect(detectChinaStock('200001')).toBeNull();
    expect(detectChinaStock('999999')).toBeNull();
  });
});

describe('parseSymbol', () => {
  test('纯代码输入：displayName 未定义，chinaInfo 正确填充', () => {
    const parsed = parseSymbol('601012');
    expect(parsed.chinaInfo?.code).toBe('601012');
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.rawInput).toBe('601012');
  });

  test('中文名+代码混合：displayName 剥离后保留名称', () => {
    const parsed = parseSymbol('隆基绿能601012');
    expect(parsed.chinaInfo?.code).toBe('601012');
    expect(parsed.displayName).toBe('隆基绿能');
  });

  test('代码在前、名称在后也能正确提取', () => {
    const parsed = parseSymbol('601012隆基绿能');
    expect(parsed.chinaInfo?.code).toBe('601012');
    expect(parsed.displayName).toBe('隆基绿能');
  });

  test('美股代码：chinaInfo 为 undefined', () => {
    const parsed = parseSymbol('AAPL');
    expect(parsed.chinaInfo).toBeUndefined();
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.rawInput).toBe('AAPL');
  });

  test('首尾空格：rawInput 已 trim', () => {
    const parsed = parseSymbol('  601012  ');
    expect(parsed.rawInput).toBe('601012');
    expect(parsed.chinaInfo?.code).toBe('601012');
  });

  test('支持显式前缀 (sh601012)', () => {
    const parsed = parseSymbol('sh601012');
    expect(parsed.chinaInfo?.sinaPrefix).toBe('sh');
    expect(parsed.chinaInfo?.code).toBe('601012');
  });

  test('支持显式前缀 (gb_aapl)', () => {
    const parsed = parseSymbol('gb_aapl');
    expect(parsed.usInfo?.sinaPrefix).toBe('gb_');
    expect(parsed.usInfo?.symbol).toBe('AAPL');
  });

  test('纯中文输入：识别为普通搜索词', () => {
    const parsed = parseSymbol('苹果');
    expect(parsed.chinaInfo).toBeUndefined();
    expect(parsed.usInfo).toBeUndefined();
    expect(parsed.rawInput).toBe('苹果');
  });

  test('港股 0700.HK：补零成 5 位标准代码', () => {
    const parsed = parseSymbol('0700.HK');
    expect(parsed.hkInfo?.code).toBe('00700');
    expect(parsed.chinaInfo).toBeUndefined();
    expect(parsed.usInfo).toBeUndefined();
  });

  test('港股 hk00700：新浪/腾讯的前缀写法同样识别', () => {
    expect(parseSymbol('hk00700').hkInfo?.code).toBe('00700');
    expect(parseSymbol('00700.hk').hkInfo?.code).toBe('00700');
  });

  test('裸数字不认作港股——更可能是 A 股代码少打一位', () => {
    // 认了就会把一次输入失误变成一份查错标的、却看不出异常的分析
    expect(parseSymbol('00700').hkInfo).toBeUndefined();
    expect(parseSymbol('0700').hkInfo).toBeUndefined();
  });

  test('6 位 A 股代码不被港股分支截胡', () => {
    // 000700 是模塑科技（深市），港股代码最长 5 位，正则须把它排除在外
    const parsed = parseSymbol('000700');
    expect(parsed.hkInfo).toBeUndefined();
    expect(parsed.chinaInfo?.code).toBe('000700');
  });

  test('空字符串或 nullish 输入：返回空 rawInput 而不崩溃', () => {
    const parsedEmpty = parseSymbol('');
    expect(parsedEmpty.rawInput).toBe('');

    // @ts-ignore: 测试无效输入
    const parsedNull = parseSymbol(null);
    expect(parsedNull.rawInput).toBe('');

    // @ts-ignore: 测试无效输入
    const parsedUndefined = parseSymbol(undefined);
    expect(parsedUndefined.rawInput).toBe('');
  });
});
