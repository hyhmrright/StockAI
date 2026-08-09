import { describe, test, expect } from 'bun:test';
import { extractSinaJson } from './sina-envelope';

describe('extractSinaJson', () => {
  test('剥掉日 K 那层防盗链注释 + JSONP 外壳', () => {
    const raw = `/*<script>location.href='//sina.com';</script>*/\nx([{"d":"2026-08-07"}]);`;
    expect(extractSinaJson<{ d: string }[]>(raw, '[')).toEqual([{ d: '2026-08-07' }]);
  });

  test('剥掉板块榜那层 `var X = {...};` 外壳', () => {
    const raw = 'var S_Finance_bankuai_sinaindustry = {"new_blhy":"a,b"};';
    expect(extractSinaJson<Record<string, string>>(raw, '{')).toEqual({ new_blhy: 'a,b' });
  });

  test('裸 JSON 也能吃（A 股 K 线那支没有外壳）', () => {
    expect(extractSinaJson<number[]>('[1,2]', '[')).toEqual([1, 2]);
  });

  test('被挡回 HTML 时返回 null 而不是抛——各调用方对失败的语义不同，由它们决定', () => {
    expect(extractSinaJson('<html>403</html>', '[')).toBeNull();
    expect(extractSinaJson('', '{')).toBeNull();
  });

  test('外壳在但 JSON 残缺时返回 null', () => {
    expect(extractSinaJson('x([{"a":]);', '[')).toBeNull();
  });

  test('只认指定的括号类型——对象响应按数组取会落空', () => {
    expect(extractSinaJson('var x = {"a":1};', '[')).toBeNull();
  });
});
