import { write, file } from "bun";
import * as path from "path";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting ESBUILD + BUN [v0.5.6] Build`);

// Step 1: ESBUILD Bundle
console.log("📦 Bundling...");
const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");

const esbuildProc = Bun.spawn([
  "npx", "esbuild", "sidecar/index.ts",
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--outfile=" + bundlePath,
  "--external:bun",
  "--minify=false"
]);

await esbuildProc.exited;

// Step 2: The "Nuclear Scrub"
let content = await file(bundlePath).text();
console.log("🧹 Scrubbing bundle...");

// 1. 抹除所有绝对路径
const G_ROOT = ["/", "Users", "runner", "work", "StockAI", "StockAI"].join("/");
content = content.split(G_ROOT).join(".");
content = content.split(projectRoot).join(".");

// 2. 核心补丁：由于 Playwright 的 require.resolve 会导致 Bun 编译失败，
// 我们直接在生成的 JS 代码中把所有的 require.resolve 替换为一个安全函数。
// 我们在 bundle 文件的头部注入这个安全函数。
const injection = `
// StockAI Bundle Header
const __safe_resolve = (p) => {
    // 忽略相对路径和指向 package.json 的请求，直接返回当前目录
    if (p.includes('package.json') || p.startsWith('.')) return ".";
    try { return require.resolve(p); } catch(e) { return "."; }
};
`;

content = injection + content;

// 3. 将代码中所有的 require.resolve 替换为 __safe_resolve
// 注意：esbuild 有时会把 require.resolve 转换成内部变量，我们需要全局匹配。
content = content.replace(/require\.resolve\(/g, "__safe_resolve(");

// 4. 暴力修复 Playwright 的 coreDir
content = content.replace(/var coreDir = .*?;/g, 'var coreDir = ".";');

await write(bundlePath, content);
console.log("✅ Scrubbing complete.");

// Step 3: BUN Compile
console.log(`📦 Compiling final binary...`);
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) process.exit(1);

console.log(`🎉 Success: ${outfile}`);
