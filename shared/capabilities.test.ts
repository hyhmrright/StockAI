import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const repoRoot = join(import.meta.dir, '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8');

// tauri-plugin-sql 的 permissions/default.toml（2.4.1 / 2.5.0 一致）：只读，不含 execute。
// src-tauri/gen/schemas 不入库、CI 单测阶段也尚未生成，故只能在此抄录。
const SQL_DEFAULT = ['allow-load', 'allow-select', 'allow-close'];

describe('前端 SQLite 调用 ↔ Tauri capabilities', () => {
  // 回归保护：capabilities 曾只给 sql:default，6 处 db.execute 在桌面端全部被拒，
  // 错误被 catch 吞掉，分析历史 / 大师 signal / 持仓四个月没写进一行。
  // 浏览器 dev 走 mock、单测 mock 掉 DB，除这条外没有任何测试看得见它。
  test('前端调用到的每个 sql 命令都已在 capabilities 授权', () => {
    const permissions: unknown[] = JSON.parse(
      read('src-tauri/capabilities/default.json'),
    ).permissions;
    const granted = new Set(permissions.filter((p): p is string => typeof p === 'string'));
    if (granted.has('sql:default')) for (const p of SQL_DEFAULT) granted.add(`sql:${p}`);

    const sources = readdirSync(join(repoRoot, 'src/lib'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => read(`src/lib/${f}`))
      .filter((s) => s.includes('@tauri-apps/plugin-sql') || s.includes('getDb'));
    const used = new Set(
      sources.flatMap((s) =>
        [...s.matchAll(/\.(execute|select|load|close)\(/g)].map((m) => `sql:allow-${m[1]}`),
      ),
    );

    // 防止正则失效让断言空转成恒绿
    expect(used.has('sql:allow-execute')).toBe(true);
    for (const p of used) expect(granted.has(p), `capabilities 缺少 ${p}`).toBe(true);
  });
});
