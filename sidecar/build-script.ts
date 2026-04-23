import { write, file } from "bun";
import * as path from "path";
import * as fs from "fs";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting ROOT-LEVEL FIX Build [v0.5.5]`);

/**
 * 核心发现：
 * Bun 在 --compile 时会将当前打包文件的绝对路径注入为 __dirname。
 * 即使我们在 bundle 里做了替换，Bun 的编译器也会在最后一步把它加回来。
 * 
 * 解决方案：
 * 1. 使用 esbuild 预打包，将所有依赖（包括 playwright）合并。
 * 2. 在 Bundle 中将所有 "__dirname" 字符串替换为 "(import.meta.dir)"。
 * 3. 抹除所有绝对路径。
 * 4. 强行截断 Playwright 的路径探测。
 */

// Step 1: Pre-patch node_modules (手术级)
const platformPath = path.join(projectRoot, "node_modules/playwright-core/lib/server/utils/nodePlatform.js");
let originalContent = "";
if (fs.existsSync(platformPath)) {
    originalContent = fs.readFileSync(platformPath, "utf-8");
    const patched = originalContent.replace(/const coreDir = .*?;/g, 'const coreDir = ".";');
    fs.writeFileSync(platformPath, patched);
}

// Step 2: Bundle with esbuild
const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");
const esbuildProc = Bun.spawn([
  "npx", "esbuild", "sidecar/index.ts",
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--outfile=" + bundlePath,
  "--external:bun",
  "--minify=false",
]);

await esbuildProc.exited;
if (originalContent) fs.writeFileSync(platformPath, originalContent);

// Step 3: Bundle Scrubbing (核平级)
let content = await file(bundlePath).text();
console.log("🧹 Scrubbing bundle...");

// A. 替换 __dirname 为 import.meta.dir
// 这是最关键的一步，防止 Bun 编译器在最后一步注入构建机器路径
content = content.replace(/\b__dirname\b/g, "import.meta.dir");

// B. 注入 Dummy Resolve
const injection = `
const __dummy_resolve = (p) => {
    if (typeof p !== 'string') return ".";
    if (p.includes('package.json') || p.startsWith('/') || p.startsWith('\\\\')) return ".";
    try { return require.resolve(p); } catch(e) { return "."; }
};
`;
content = injection + content.replace(/require\.resolve\(/g, "__dummy_resolve(");

// C. 抹除所有路径模式
const G_ROOT = "/Users/runner/work/StockAI/StockAI";
content = content.split(G_ROOT).join(".");
content = content.split(projectRoot).join(".");

// D. 特殊处理 Playwright 的 coreDir
content = content.replace(/var coreDir = .*?;/g, 'var coreDir = ".";');

await write(bundlePath, content);

// Step 4: Compile with Bun
console.log(`📦 Compiling...`);
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) process.exit(1);

// Step 5: 严苛自检
const binaryContent = await file(outfile).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');
const leakCheck = ["/", "Users", "runner"].join("/");

if (binaryText.includes(leakCheck)) {
    console.error(`❌ ERROR: Absolute path leak detected in binary!`);
    // 在 GitHub Actions 中强制失败
    if (process.env.GITHUB_ACTIONS) process.exit(1);
} else {
    console.log("✨ Binary is PURE.");
}

console.log(`🎉 Final result: ${outfile}`);
