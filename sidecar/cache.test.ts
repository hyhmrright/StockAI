import { expect, test, describe, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { cacheKey, readCache, writeCache } from './cache';

// 每个测试用独立临时目录（DI 注入 opts.dir），互不污染，结束统一清理
const dirs: string[] = [];
function freshDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), 'stockai-cache-test-'));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('cacheKey', () => {
  test('相同部件得相同 key、不同部件得不同 key', () => {
    expect(cacheKey(['a', 'b'])).toBe(cacheKey(['a', 'b']));
    expect(cacheKey(['a', 'b'])).not.toBe(cacheKey(['a', 'c']));
  });

  test('规范化分隔避免边界撞 key', () => {
    // ['a','bc'] 与 ['ab','c'] 不得撞 key
    expect(cacheKey(['a', 'bc'])).not.toBe(cacheKey(['ab', 'c']));
  });
});

describe('readCache / writeCache', () => {
  test('写入后可命中并取回原值', () => {
    const dir = freshDir();
    const key = cacheKey(['hit', '1']);
    writeCache(key, { signal: 'bullish', n: 13 }, { dir });
    expect(readCache(key, { dir })).toEqual({ signal: 'bullish', n: 13 });
  });

  test('未知 key 返回 null', () => {
    const dir = freshDir();
    expect(readCache(cacheKey(['nope']), { dir })).toBeNull();
  });

  test('超过 TTL 视为过期返回 null', () => {
    const dir = freshDir();
    const key = cacheKey(['ttl']);
    writeCache(key, { v: 1 }, { dir });
    // 用负 ttl 确定性触发过期（避开 fs mtime 亚毫秒抖动导致 age 在 0 边界附近的不稳定）
    expect(readCache(key, { dir, ttlMs: -1000 })).toBeNull();
  });

  test('LRU 修剪：文件数不超过 maxEntries', () => {
    const dir = freshDir();
    for (let i = 0; i < 5; i++) writeCache(cacheKey(['lru', i]), { i }, { dir, maxEntries: 3 });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeLessThanOrEqual(3);
  });

  /**
   * **maxEntries 是目录级配额，不是调用方级配额**——两种用途共用一个目录时，
   * 配额最小的那个说了算，会把另一方的数据一并删掉，且全程无任何报错。
   *
   * 这不是假想：龙虎榜/板块榜（各只需 4 条）最初没设 `dir`，落进了 deep-analysis 的
   * 默认目录，实测写一次就删掉 7 条深度分析结果（每条代表 15 次 LLM 调用）。
   * 修法是各模块用独立 `dir`（f10 / 财报历史 / 全市场快照一直如此）。
   *
   * 本用例把这个陷阱本身钉住：它**断言的是当前的危险行为**，好让下一个想
   * 「省事共用默认目录」的人在注释之外还能撞到一条明确的红线。
   */
  test('共用目录时，小 maxEntries 会连带删掉另一用途的缓存', () => {
    const shared = freshDir();
    const precious = Array.from({ length: 6 }, (_, i) => cacheKey(['deep-analysis', i]));
    for (const k of precious) writeCache(k, { llmCalls: 15 }, { dir: shared });

    // 另一个用途只想留 2 条，却裁掉了整个目录
    writeCache(
      cacheKey(['billboard']),
      { tradeDate: '2026-08-07' },
      { dir: shared, maxEntries: 2 },
    );

    const survived = precious.filter((k) => readCache(k, { dir: shared }) !== null).length;
    expect(survived).toBeLessThan(6);
  });

  test('缓存目录不存在时读取安全返回 null（不抛）', () => {
    const missing = path.join(tmpdir(), 'stockai-cache-test-missing-xyz');
    expect(readCache(cacheKey(['x']), { dir: missing })).toBeNull();
  });
});
