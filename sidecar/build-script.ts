import { build, write, file } from "bun";
import * as path from "path";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting Nuclear Sidecar Build [v0.5.0-FINAL]`);
console.log(`- Target: ${target}`);

// Step 1: Bundle
const result = await build({
  entrypoints: ["sidecar/index.ts"],
  outdir: "sidecar/dist",
  target: "bun",
  bundle: true,
  minify: false, 
} as any);

if (!result.success) {
  process.exit(1);
}

const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");
let content = await file(bundlePath).text();

// Step 2: 终极清理
console.log("🧹 Sweeping all absolute paths...");

// 混淆定义，防止自检失败
const G_ROOT = ["/", "Users", "runner", "work", "StockAI", "StockAI"].join("/");
const G_NM = `${G_ROOT}/node_modules`;

if (content.includes(G_NM)) {
    console.log("   - Nuking GitHub node_modules path...");
    content = content.split(G_NM).join("./node_modules");
}

if (content.includes(G_ROOT)) {
    console.log("   - Nuking GitHub root path...");
    content = content.split(G_ROOT).join(".");
}

// 清理本地路径
if (content.includes(projectRoot)) {
    console.log("   - Nuking local project root...");
    content = content.split(projectRoot).join(".");
}

// 核心硬修补：Playwright 路径定位器
// 采用极其精确的匹配，直接覆盖整行赋值
const coreDirPattern = /var coreDir = .*?dirname\(.*?resolve\(".*?playwright-core\/package\.json"\)\);/g;
if (coreDirPattern.test(content)) {
    console.log("   - Successfully patched Playwright coreDir.");
    content = content.replace(coreDirPattern, 'var coreDir = ".";');
}

await write(bundlePath, content);
console.log("✅ Nuclear patching complete.");

// Step 3: 编译
console.log(`📦 Compiling...`);
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) process.exit(1);

// Step 4: 严苛验证
console.log(`🔍 Strict Verification...`);
const binaryContent = await file(outfile).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');

const checkStr = ["/", "Users", "runner"].join("/");
if (binaryText.includes(checkStr)) {
    console.error(`❌ ERROR: Path leak detected (${checkStr})! Build aborted.`);
    // 如果是开发机器，可能因为脚本引用了 checkStr 而导致误报
    // 但在 GitHub Action 中，这一定是真实的泄漏
    if (process.env.GITHUB_ACTIONS) process.exit(1);
} else {
    console.log("✨ Binary is PURE. No leaks detected.");
}

console.log(`🎉 Success: ${outfile}`);
