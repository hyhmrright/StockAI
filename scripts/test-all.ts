#!/usr/bin/env bun
// 聚合 runner：一次跑前端 vitest + sidecar bun test，统一聚合状态码与摘要。
// 默认仅跑单元测试（快、稳定、离线）；加 --integration 同时跑 sidecar 集成测试。
// 用 bun test 自带 --timeout 控制单测超时，不依赖 GNU `timeout`（macOS 默认不带）。
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

interface Suite {
  name: string;
  cwd: string;
  cmd: string;
  args: string[];
}

interface Result {
  suite: Suite;
  exitCode: number;
  durationMs: number;
}

function runSuite(suite: Suite): Promise<Result> {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    console.log(`\n━━━ ▶ ${suite.name}`);
    console.log(`  ${suite.cmd} ${suite.args.join(' ')}  (cwd: ${suite.cwd})`);
    const child = spawn(suite.cmd, suite.args, {
      cwd: suite.cwd,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => {
      resolveResult({
        suite,
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt,
      });
    });
    child.on('error', (err) => {
      console.error(`  启动失败: ${err.message}`);
      resolveResult({ suite, exitCode: 1, durationMs: Date.now() - startedAt });
    });
  });
}

function buildSuites(withIntegration: boolean): Suite[] {
  const suites: Suite[] = [
    {
      name: 'frontend (vitest)',
      cwd: ROOT,
      cmd: 'bunx',
      args: ['vitest', 'run'],
    },
    {
      name: 'sidecar (bun test, 单元)',
      cwd: resolve(ROOT, 'sidecar'),
      cmd: 'bun',
      // sidecar/*.integration.ts 不带 .test 后缀，bun test 默认按 *.test.ts 匹配，天然排除集成
      args: ['test', '--timeout=10000'],
    },
  ];
  if (withIntegration) {
    suites.push({
      name: 'sidecar (bun test, 集成 — 需要网络)',
      cwd: resolve(ROOT, 'sidecar'),
      cmd: 'bun',
      args: ['test', '--timeout=30000', 'scraper.integration.ts'],
    });
  }
  return suites;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const withIntegration = args.includes('--integration');

  const suites = buildSuites(withIntegration);
  const results: Result[] = [];
  for (const suite of suites) {
    results.push(await runSuite(suite));
  }

  console.log('\n━━━ 汇总 ━━━');
  for (const r of results) {
    const status = r.exitCode === 0 ? '✓' : '✗';
    console.log(`  ${status} ${r.suite.name}  (${(r.durationMs / 1000).toFixed(2)}s)`);
  }
  const failed = results.filter((r) => r.exitCode !== 0);
  if (failed.length > 0) {
    console.error(`\n失败 ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`\n全部通过 ${results.length}/${results.length}`);
}

main();
