import { build, write, file } from "bun";
import * as path from "path";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting Robust Sidecar Build`);
console.log(`- Target: ${target}`);

// Step 1: Bundle
const result = await build({
  entrypoints: ["sidecar/index.ts"],
  outdir: "sidecar/dist",
  target: "bun",
  bundle: true,
  minify: false, // 暂时不压缩，确保正则能匹配到
} as any);

if (!result.success) {
  console.error("❌ Build failed");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");
let content = await file(bundlePath).text();

// Step 2: 暴力清理
console.log("🧹 Neutralizing build-machine specific paths...");

// 1. 替换所有被 Bun 自动转义的绝对路径
content = content.replace(/\/Users\/.*?\/(node_modules\/)/g, "./$1");

// 2. 针对 playwright-core 的核心目录定位逻辑进行修补
// 匹配: var coreDir = import_path.default.dirname(require.resolve("playwright-core/package.json"));
// 或者被 Bun 转换后的各种形式 (__require.resolve)
const playwrightPattern = /var coreDir = .*?dirname\(.*?require\.resolve\(".*?playwright-core\/package\.json"\)\);/g;
if (playwrightPattern.test(content)) {
  console.log("   - Found playwright coreDir locator, patching...");
  content = content.replace(playwrightPattern, 'var coreDir = ".";');
}

// 3. 全局搜索并移除任何残留的 __require.resolve 绝对路径
content = content.replace(/__require\.resolve\("\/Users\/.*?"\)/g, '""');

await write(bundlePath, content);
console.log("✅ Patching complete.");

// Step 3: 编译
console.log(`📦 Compiling...`);
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(1);
}

console.log(`🎉 Success: ${outfile}`);
