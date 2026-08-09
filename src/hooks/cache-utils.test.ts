import { describe, it, expect } from 'vitest';
import { setWithLRI } from './cache-utils';

/** 按顺序灌入若干条，返回结果 Map */
function fill(entries: [string, number][], capacity: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const [k, v] of entries) setWithLRI(map, k, v, capacity);
  return map;
}

describe('setWithLRI', () => {
  it('未达容量时不淘汰任何条目', () => {
    expect([
      ...fill(
        [
          ['a', 1],
          ['b', 2],
        ],
        3,
      ).keys(),
    ]).toEqual(['a', 'b']);
  });

  it('超出容量时淘汰最早插入的那条', () => {
    expect([
      ...fill(
        [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ],
        2,
      ).keys(),
    ]).toEqual(['b', 'c']);
  });

  /** 这是限容的**全部意义**：按 symbol 分桶的异步结果仓库不能无上限地长 */
  it('连续写入远超容量时体积恒被守住', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 100; i++) setWithLRI(map, `k${i}`, i, 10);

    expect(map.size).toBe(10);
    expect(map.get('k99')).toBe(99);
    expect(map.has('k89')).toBe(false);
  });

  it('更新已存在的 key 只改值，不淘汰也不扩容', () => {
    const map = fill(
      [
        ['a', 1],
        ['b', 2],
      ],
      2,
    );
    setWithLRI(map, 'a', 42, 2);

    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(42);
  });

  /**
   * LRI 不是 LRU：命中**不刷新**插入位置。名字里的 I（Inserted）就是这个意思，
   * 别在读路径上加"提升到队尾"——那会把它悄悄变成另一种淘汰策略。
   */
  it('刚被更新过的旧 key 照样先出局', () => {
    const map = fill(
      [
        ['a', 1],
        ['b', 2],
      ],
      2,
    );
    setWithLRI(map, 'a', 42, 2); // a 刚写过
    setWithLRI(map, 'c', 3, 2); // 淘汰的仍是 a，不是 b

    expect([...map.keys()]).toEqual(['b', 'c']);
  });
});
