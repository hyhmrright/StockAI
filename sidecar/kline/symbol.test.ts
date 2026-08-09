import { describe, test, expect } from 'bun:test';
import { parseChinaSymbol, chinaPrefixToEastmoneyMarket, parseUsSymbol } from './symbol';

describe('parseChinaSymbol', () => {
  test('显式 sh 前缀优先', () => {
    expect(parseChinaSymbol('sh600519')).toEqual({ prefix: 'sh', code: '600519' });
  });

  test('显式 sz 前缀优先（首位与默认推断冲突时也按显式）', () => {
    expect(parseChinaSymbol('sz600001')).toEqual({ prefix: 'sz', code: '600001' });
  });

  test('无前缀 + 首位 6 → sh', () => {
    expect(parseChinaSymbol('600519')).toEqual({ prefix: 'sh', code: '600519' });
  });

  test('无前缀 + 首位 0 → sz', () => {
    expect(parseChinaSymbol('000001')).toEqual({ prefix: 'sz', code: '000001' });
  });

  test('无前缀 + 首位 3（创业板）→ sz', () => {
    expect(parseChinaSymbol('300750')).toEqual({ prefix: 'sz', code: '300750' });
  });

  test('无前缀 + 首位 8（北交所）→ bj', () => {
    expect(parseChinaSymbol('832000')).toEqual({ prefix: 'bj', code: '832000' });
  });

  test('无前缀 + 首位 4（北交所老代码）→ bj', () => {
    expect(parseChinaSymbol('430000')).toEqual({ prefix: 'bj', code: '430000' });
  });

  test('大写 SH 也能识别', () => {
    expect(parseChinaSymbol('SH600519')).toEqual({ prefix: 'sh', code: '600519' });
  });

  test('非 A 股 symbol 抛错', () => {
    expect(() => parseChinaSymbol('AAPL')).toThrow(/无法解析/);
  });
});

describe('chinaPrefixToEastmoneyMarket', () => {
  test('sh → 1', () => expect(chinaPrefixToEastmoneyMarket('sh')).toBe(1));
  test('sz → 0', () => expect(chinaPrefixToEastmoneyMarket('sz')).toBe(0));
  test('bj → 0', () => expect(chinaPrefixToEastmoneyMarket('bj')).toBe(0));
});

describe('parseUsSymbol', () => {
  test('剥掉 gb_ 前缀并统一大写', () => {
    expect(parseUsSymbol('gb_aapl')).toEqual({ ticker: 'AAPL', isIndex: false });
    expect(parseUsSymbol('aapl')).toEqual({ ticker: 'AAPL', isIndex: false });
  });

  test('Yahoo 的指数代码换成各源通用 id', () => {
    // 前端 IndexBar 一律用 Yahoo 写法，照搬给腾讯/新浪只会拿到空响应
    expect(parseUsSymbol('^GSPC')).toEqual({ ticker: 'INX', isIndex: true });
    expect(parseUsSymbol('^IXIC')).toEqual({ ticker: 'IXIC', isIndex: true });
    expect(parseUsSymbol('^DJI')).toEqual({ ticker: 'DJI', isIndex: true });
  });

  test('未登记的 ^ 代码按个股处理，不静静吞掉', () => {
    expect(parseUsSymbol('^RUT')).toEqual({ ticker: '^RUT', isIndex: false });
  });
});
