import { test, expect } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, resolve, relative, join } from 'path';
import { builtinModules } from 'module';

/**
 * 守住「启动期急加载闭包」这一个不变量。
 *
 * sidecar 是 spawn-per-call 的一次性进程：启动路径上的模块图在**每一次**调用时都要
 * 完整加载一遍，包括 `--quotes`（前端每 10 秒轮询一次）这种只读几个数字的动作。
 * 因此重依赖一律 `deps._x ?? await import(...)` 留在函数体内。
 *
 * 两个入口都要走：`index.ts` 是进程入口，`cli-handlers/index.ts` 由它 `await import`
 * 进来、每次派发必经。前者漏一个重 import 同样致命，故这里取两者闭包的并集。
 *
 * **光校验直接 import 的白名单挡不住这条规则被破坏**——历史事故的形态是
 * `cli-handlers/analysis.ts` 顶层 `import { ScrapeEmptyError } from '../analysis'`：
 * 说明符本身平平无奇，重量全在传递依赖里（scraper → 五个抓取策略 → browser-manager，
 * 外加 openai / ollama / @anthropic-ai/sdk 三个 SDK，实测 38 个模块 / 46ms）。
 * 所以这里断的是**传递闭包**。
 *
 * 闭包变化即测试失败，这是刻意的：往启动路径上加东西应当是一个自觉的决定，
 * 而不是某次顺手 import 的副产品。确认新成员确实轻量后，更新下面的名单即可。
 */

const SIDECAR_ROOT = import.meta.dir;

/** 启动路径的两个入口：进程入口，以及每次派发必经的 handler 聚合入口 */
const ENTRY_POINTS = ['index.ts', 'cli-handlers/index.ts'];

/** 启动期允许急加载的模块（相对 `sidecar/`），全部为叶子或近叶子的轻量模块 */
const EXPECTED_EAGER_MODULES = [
  '../shared/actions.ts',
  '../shared/constants.ts',
  '../shared/types/index.ts',
  'cli-handlers/analysis.ts',
  'cli-handlers/context.ts',
  'cli-handlers/conversation.ts',
  'cli-handlers/index.ts',
  'cli-handlers/market-data.ts',
  'cli-handlers/models.ts',
  'cli-handlers/screener.ts',
  'errors.ts',
  'index.ts',
  'log.ts',
  'protocol.ts',
  'utils.ts',
];

/** Node 内置模块不是第三方包，不带来安装体积与加载开销。用 Node 自己的清单，不手写 */
const NODE_BUILTINS = new Set(builtinModules);

const TYPES_BARREL_DIR = '../shared/types';

/** Windows 的 `relative()` 吐反斜杠，而名单与下面的 barrel 收拢都按 POSIX 写死——不归一化则两者全部失配 */
const toPosix = (p: string) => p.replaceAll('\\', '/');

/** 纯类型 barrel 的 `export *` 子文件收拢成 barrel 一个节点——运行时零成本，逐条列出只是噪声。
 *  这个收拢的前提由下面 `TypesBarrel_ContainsNoRuntimeValue` 钉住。 */
function collapseTypesBarrel(rel: string): string {
  return rel.startsWith(`${TYPES_BARREL_DIR}/`) ? `${TYPES_BARREL_DIR}/index.ts` : rel;
}

/**
 * 抽出一个文件里所有会**触发加载**的模块说明符。
 *
 * `import type` / `export type` 编译期即擦除，不产生运行时加载，故排除；
 * 副作用 import（`import './x';`）与值 re-export（`export { y } from './x';`）都算。
 */
function loadingSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /^(?:import|export)\s+(?!type\s)[\s\S]*?\s+from\s+['"]([^'"]+)['"];/gm, // 值 import / re-export
    /^import\s+['"]([^'"]+)['"];/gm, // 副作用 import
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

/** 把相对说明符解析成实际文件路径；裸包（npm / node 内置）返回 null */
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function walkEagerGraph(): { modules: string[]; barePackages: string[] } {
  const visited = new Set<string>();
  const bare = new Set<string>();
  const queue = ENTRY_POINTS.map((e) => resolve(SIDECAR_ROOT, e));
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const spec of loadingSpecifiers(readFileSync(file, 'utf8'))) {
      const resolved = resolveRelative(file, spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith('.')) bare.add(spec);
    }
  }
  const modules = new Set(
    [...visited].map((f) => collapseTypesBarrel(toPosix(relative(SIDECAR_ROOT, f)))),
  );
  return { modules: [...modules].sort(), barePackages: [...bare].sort() };
}

test('StartupGraph_StaysMinimal', () => {
  expect(walkEagerGraph().modules).toEqual(EXPECTED_EAGER_MODULES);
});

test('StartupGraph_PullsInNoThirdPartyPackage', () => {
  // 三个 AI SDK 与 playwright 一系都很重；它们只该在真正要用时 await import
  const thirdParty = walkEagerGraph().barePackages.filter(
    (p) => !NODE_BUILTINS.has(p.replace(/^node:/, '')),
  );
  expect(thirdParty).toEqual([]);
});

test('TypesBarrel_ContainsNoRuntimeValue', () => {
  // 上面把 barrel 子树收拢成一个节点，前提是它们编译后不产生任何运行时代码
  const dir = resolve(SIDECAR_ROOT, TYPES_BARREL_DIR);
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) =>
      /^export\s+(const|function|class|let|var|enum|default)\b/m.test(
        readFileSync(join(dir, f), 'utf8'),
      ),
    );
  expect(offenders).toEqual([]);
});
