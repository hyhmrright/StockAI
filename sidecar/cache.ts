import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { logger, toErrorMessage } from './utils';

/**
 * 磁盘结果缓存。
 *
 * 为什么落盘而非内存：Sidecar 由 Rust 每次 action `spawn` 一个新进程、跑完即
 * `process.exit`，进程内内存缓存无法跨「重复点击」存活。落盘缓存写在系统临时目录，
 * 跨进程可命中——这才是 13 大师深度分析「同股重复点全量重跑 15 次 LLM」漏钱点的有效修法。
 *
 * 设计原则：缓存永远不阻断主流程——任何 IO/解析错误都吞掉并降级为「未命中」。
 */

const DEFAULT_DIR = path.join(tmpdir(), 'stockai-analysis-cache');
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 分钟：兼顾「重复点击省钱」与「新闻时效」
const DEFAULT_MAX_ENTRIES = 50; // LRU 上限，防临时目录无限膨胀

export interface CacheOptions {
  dir?: string;
  ttlMs?: number;
  maxEntries?: number;
}

/** 把任意 key 部件拼成稳定哈希（碰撞概率可忽略），用作缓存文件名 */
export function cacheKey(parts: (string | number)[]): string {
  // 用 JSON.stringify 规范化：带引号/逗号/转义，杜绝 ['a','bc'] 与 ['ab','c'] 的边界撞 key
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** 读缓存：命中且未过期返回解析值；未命中/过期/任何错误均返回 null（过期项顺手删除） */
export function readCache<T>(key: string, opts: CacheOptions = {}): T | null {
  const dir = opts.dir ?? DEFAULT_DIR;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const file = path.join(dir, `${key}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    // age >= ttlMs 才算过期：使 ttlMs=0 能立即过期（禁用缓存），符合 TTL 语义
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age >= ttlMs) {
      try { fs.unlinkSync(file); } catch { /* 已被并发清理，忽略 */ }
      return null;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    logger.warn(`缓存读取失败（降级为未命中）: ${toErrorMessage(err)}`);
    return null;
  }
}

/** 写缓存：原子写（临时文件 + rename）后做 LRU 修剪。失败仅告警，不抛出 */
export function writeCache<T>(key: string, value: T, opts: CacheOptions = {}): void {
  const dir = opts.dir ?? DEFAULT_DIR;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const file = path.join(dir, `${key}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, file); // 原子替换，避免并发进程读到半截内容
    pruneOldest(dir, maxEntries);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* tmp 可能未生成 */ }
    logger.warn(`缓存写入失败（忽略）: ${toErrorMessage(err)}`);
  }
}

/** LRU 修剪：按 mtime 升序删除最旧的缓存文件，直到数量 ≤ maxEntries */
function pruneOldest(dir: string, maxEntries: number): void {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length <= maxEntries) return;
  const byMtime = files
    .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => a.m - b.m);
  for (const { f } of byMtime.slice(0, files.length - maxEntries)) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* 已被并发删除，忽略 */ }
  }
}
