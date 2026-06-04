import { expect, test, describe, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { cacheKey, readCache, writeCache } from "./cache";

// 每个测试用独立临时目录（DI 注入 opts.dir），互不污染，结束统一清理
const dirs: string[] = [];
function freshDir(): string {
  const d = fs.mkdtempSync(path.join(tmpdir(), "stockai-cache-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("cacheKey", () => {
  test("相同部件得相同 key、不同部件得不同 key", () => {
    expect(cacheKey(["a", "b"])).toBe(cacheKey(["a", "b"]));
    expect(cacheKey(["a", "b"])).not.toBe(cacheKey(["a", "c"]));
  });

  test("规范化分隔避免边界撞 key", () => {
    // ['a','bc'] 与 ['ab','c'] 不得撞 key
    expect(cacheKey(["a", "bc"])).not.toBe(cacheKey(["ab", "c"]));
  });
});

describe("readCache / writeCache", () => {
  test("写入后可命中并取回原值", () => {
    const dir = freshDir();
    const key = cacheKey(["hit", "1"]);
    writeCache(key, { signal: "bullish", n: 13 }, { dir });
    expect(readCache(key, { dir })).toEqual({ signal: "bullish", n: 13 });
  });

  test("未知 key 返回 null", () => {
    const dir = freshDir();
    expect(readCache(cacheKey(["nope"]), { dir })).toBeNull();
  });

  test("超过 TTL 视为过期返回 null", () => {
    const dir = freshDir();
    const key = cacheKey(["ttl"]);
    writeCache(key, { v: 1 }, { dir });
    // 用负 ttl 确定性触发过期（避开 fs mtime 亚毫秒抖动导致 age 在 0 边界附近的不稳定）
    expect(readCache(key, { dir, ttlMs: -1000 })).toBeNull();
  });

  test("LRU 修剪：文件数不超过 maxEntries", () => {
    const dir = freshDir();
    for (let i = 0; i < 5; i++) writeCache(cacheKey(["lru", i]), { i }, { dir, maxEntries: 3 });
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    expect(files.length).toBeLessThanOrEqual(3);
  });

  test("缓存目录不存在时读取安全返回 null（不抛）", () => {
    const missing = path.join(tmpdir(), "stockai-cache-test-missing-xyz");
    expect(readCache(cacheKey(["x"]), { dir: missing })).toBeNull();
  });
});
