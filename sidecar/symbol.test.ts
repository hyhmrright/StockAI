import { describe, test, expect } from 'bun:test';
import type { StockInfo } from '../shared/types';
import { parseSymbol } from './parsers/exchange';
import { needsNameLookup, enhanceSymbol } from './symbol';

// 两个函数都是纯的，直接喂真实 parseSymbol 的输出即可——不再需要 mock.module('./stock-info')，
// 那正是 bun:test 里会跨文件泄漏的全局 mock。

const info = (name: string) => ({ name }) as StockInfo;

describe('needsNameLookup', () => {
  test('A 股纯代码：需要先查公司名', () => {
    expect(needsNameLookup(parseSymbol('601012'))).toBe(true);
  });

  test('已含中文名的输入：无需再查', () => {
    expect(needsNameLookup(parseSymbol('隆基绿能601012'))).toBe(false);
  });

  test('美股：无需查名，调用方据此让信息与新闻并发', () => {
    expect(needsNameLookup(parseSymbol('AAPL'))).toBe(false);
  });
});

describe('enhanceSymbol', () => {
  test('A 股纯代码：用公司名拼接提升新闻命中率', () => {
    const parsed = parseSymbol('601012');
    expect(enhanceSymbol('601012', parsed, info('隆基绿能'))).toBe('隆基绿能601012');
  });

  test('信息源失败（null）时回退原输入——增强是优化而非强依赖', () => {
    const parsed = parseSymbol('601012');
    expect(enhanceSymbol('601012', parsed, null)).toBe('601012');
  });

  test('信息里没有 name 字段时同样回退', () => {
    const parsed = parseSymbol('601012');
    expect(enhanceSymbol('601012', parsed, {} as StockInfo)).toBe('601012');
  });

  test('非 A 股：拿到名字也原样返回，不拼中文名', () => {
    const parsed = parseSymbol('AAPL');
    expect(enhanceSymbol('AAPL', parsed, info('Apple Inc.'))).toBe('AAPL');
  });
});
