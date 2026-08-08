#!/usr/bin/env bun
// 聚合 runner：一次跑前端 vitest + sidecar bun test，统一聚合状态码与摘要。
// 默认仅跑单元测试（快、稳定、离线）；--integration 追加 sidecar 集成测试，
// --integration-only 只跑集成（每日数据源冒烟任务用）。
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

/** 单元套件跑什么、集成套件跑什么 */
type Mode = 'unit' | 'unit+integration' | 'integration';

const SIDECAR = resolve(ROOT, 'sidecar');

/**
 * 集成测试文件按 glob 发现，不硬编码清单——新增一个 *.integration.ts 却忘了登记，
 * 结果是它静默地永远不跑，和没写一样。清单化就是在等这种事故。
 */
function integrationFiles(): string[] {
  // 必须带 './' 前缀：不带前缀时 bun test 把参数当**过滤器**而非路径，
  // 而文件名不含 .test/.spec，过滤器一个都匹配不上，直接「0 个文件」退出 1。
  return [...new Bun.Glob('**/*.integration.ts').scanSync({ cwd: SIDECAR })]
    .sort()
    .map((f) => `./${f}`);
}

function buildSuites(mode: Mode): Suite[] {
  const unitSuites: Suite[] = [
    {
      name: 'frontend (vitest)',
      cwd: ROOT,
      cmd: 'bunx',
      args: ['vitest', 'run'],
    },
    {
      name: 'sidecar (bun test, 单元)',
      cwd: SIDECAR,
      cmd: 'bun',
      // sidecar/*.integration.ts 不带 .test 后缀，bun test 默认按 *.test.ts 匹配，天然排除集成
      args: ['test', '--timeout=10000'],
    },
    {
      // shared/ 的跨层契约测试（动作清单 ↔ 三层布线一致性）；必须限定路径，
      // 否则根目录 bun test 会捞到需要 vitest/happy-dom 的 src/**.test.tsx
      name: 'shared (bun test, 跨层契约)',
      cwd: ROOT,
      cmd: 'bun',
      args: ['test', '--timeout=10000', 'shared/'],
    },
  ];
  if (mode === 'unit') return unitSuites;

  const files = integrationFiles();
  if (files.length === 0) {
    // 不能放行：无参数的 bun test 会改跑全量单测，伪装成「集成测试通过」
    throw new Error(`未发现任何 *.integration.ts（${SIDECAR}）`);
  }
  const integrationSuite: Suite = {
    name: `sidecar (bun test, 集成 — 需要网络, ${files.length} 个文件)`,
    cwd: SIDECAR,
    cmd: 'bun',
    // 全市场快照分页约 20s，超时给到 90s
    args: ['test', '--timeout=90000', ...files],
  };
  return mode === 'integration' ? [integrationSuite] : [...unitSuites, integrationSuite];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // --integration-only 供每日数据源冒烟任务用：单测每个 PR 都跑过了，
  // 再跑一遍只会稀释「外部数据源挂了」这个信号。
  const mode: Mode = args.includes('--integration-only')
    ? 'integration'
    : args.includes('--integration')
      ? 'unit+integration'
      : 'unit';

  const suites = buildSuites(mode);
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
