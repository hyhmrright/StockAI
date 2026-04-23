import { build, write, file } from "bun";
import * as path from "path";

const projectRoot = path.resolve(import.meta.dir, "..");
// 在 GitHub Actions 中，node_modules 的路径可能不同
// 我们动态获取当前的 node_modules 绝对路径并准备清理它
const nodeModulesPath = path.join(projectRoot, "node_modules");

const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting Sidecar Build`);
console.log(`- Project Root: ${projectRoot}`);
console.log(`- Build Target: ${target}`);
console.log(`- Output File: ${outfile}`);

// Step 1: Bundle into a single JS file
// 这一步会将所有依赖（包括 playwright-core）打包进一个 JS
const result = await build({
  entrypoints: ["sidecar/index.ts"],
  outdir: "sidecar/dist",
  target: "bun",
  bundle: true,
  minify: true, // 开启压缩以减小体积
} as any);

if (!result.success) {
  console.error("❌ Build failed");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");
let content = await file(bundlePath).text();

// Step 2: 彻底清理绝对路径
// Playwright 和其他库常使用 __require.resolve("/绝对路径/package.json")
// 这在构建机器上有效，但在用户机器上会崩溃。
console.log("🧹 Patching absolute paths and resolving build-time leaks...");

// 1. 替换所有指向 node_modules 的绝对路径为相对路径
const escapedPath = nodeModulesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nodeModulesPattern = new RegExp(escapedPath, "g");
content = content.replace(nodeModulesPattern, "./node_modules");

// 2. 针对 playwright-core 的特殊处理
// 将任何残留的绝对路径 require.resolve 替换为标准的 require.resolve
// 这样它在运行时会尝试从当前环境寻找，而不是去死磕构建时的路径
content = content.replace(/__require\.resolve\(".*?\/node_modules\/playwright-core\/(.*?)"\)/g, 'require.resolve("playwright-core/$1")');

await write(bundlePath, content);
console.log("✅ Patching complete.");

// Step 3: 编译为二进制文件
console.log(`📦 Compiling to standalone binary...`);
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error("❌ Compilation failed");
  process.exit(1);
}

console.log(`🎉 Sidecar successfully compiled to: ${outfile}`);
