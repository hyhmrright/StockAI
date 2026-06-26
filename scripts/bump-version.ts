#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SEMVER = /^\d+\.\d+\.\d+$/;
const ROOT = resolve(import.meta.dir, '..');

interface Target {
  path: string;
  // 捕获组：1=前缀（包含已有的 "version": " 或 version = "），2=旧版本号，3=收尾的引号
  pattern: RegExp;
  label: string;
}

const TARGETS: Target[] = [
  {
    path: 'package.json',
    pattern: /^(\s+"version":\s*")(\d+\.\d+\.\d+)(")/m,
    label: 'package.json (顶层 "version")',
  },
  {
    path: 'src-tauri/tauri.conf.json',
    pattern: /^(\s+"version":\s*")(\d+\.\d+\.\d+)(")/m,
    label: 'src-tauri/tauri.conf.json (顶层 "version")',
  },
  {
    // 前提：单 crate。若未来加 [workspace.package].version，需将 pattern 限制在 [package] 段
    path: 'src-tauri/Cargo.toml',
    pattern: /^(version\s*=\s*")(\d+\.\d+\.\d+)(")/m,
    label: 'src-tauri/Cargo.toml ([package].version)',
  },
];

interface Plan {
  target: Target;
  fullPath: string;
  raw: string;
  oldVersion: string;
}

async function planAll(versionArg: string): Promise<Plan[]> {
  const plans: Plan[] = [];
  const missing: string[] = [];

  for (const target of TARGETS) {
    const fullPath = resolve(ROOT, target.path);
    const raw = await readFile(fullPath, 'utf-8');
    const match = raw.match(target.pattern);
    if (!match) {
      missing.push(target.label);
      continue;
    }
    const [, , oldVersion] = match;
    plans.push({ target, fullPath, raw, oldVersion });
  }

  if (missing.length > 0) {
    for (const label of missing) {
      console.error(`✗ ${label}: 未匹配到 version 字段`);
    }
    console.error(`\n中止：${missing.length} 个目标未匹配，未做任何写盘`);
    process.exit(1);
  }

  return plans;
}

async function applyAll(plans: Plan[], versionArg: string, write: boolean): Promise<void> {
  let touched = 0;
  for (const plan of plans) {
    if (plan.oldVersion === versionArg) {
      console.log(`= ${plan.target.label}: 已是 ${versionArg}`);
      continue;
    }
    if (write) {
      const next = plan.raw.replace(
        plan.target.pattern,
        (_full, pre: string, _old: string, post: string) => `${pre}${versionArg}${post}`,
      );
      await writeFile(plan.fullPath, next);
      console.log(`✓ ${plan.target.label}: ${plan.oldVersion} → ${versionArg}`);
      touched++;
    } else {
      console.log(`→ ${plan.target.label}: ${plan.oldVersion} → ${versionArg}  (dry-run)`);
    }
  }
  if (!write) console.log('\n(dry-run) 加 --write 实际写盘');
  else if (touched === 0) console.log('\n所有目标已是目标版本，无需改动');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const versionArg = args.find((a) => !a.startsWith('--'));

  if (!versionArg) {
    console.error('用法: bun scripts/bump-version.ts <x.y.z> [--write]');
    process.exit(2);
  }
  if (!SEMVER.test(versionArg)) {
    console.error(`错误: 版本号 "${versionArg}" 不符合 x.y.z 格式`);
    process.exit(2);
  }

  const plans = await planAll(versionArg);
  await applyAll(plans, versionArg, write);
}

main();
