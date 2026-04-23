import { write, file } from "bun";
import * as path from "path";
import * as fs from "fs";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting FINAL ULTIMATE Build [v0.5.3]`);
console.log(`- Target: ${target}`);

/**
 * 终极策略：
 * 1. 在打包前，暴力修补 playwright-core。
 * 2. 使用 esbuild 打包，同时使用 --define 劫持 require.resolve。
 * 3. 扫描生成的 Bundle，用正则抹除所有绝对路径。
 */

// Step 1: Pre-patch
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
  "--define:require.resolve=__dummy_resolve", // 劫持所有 require.resolve
]);

await esbuildProc.exited;

// 还原
if (originalContent) fs.writeFileSync(platformPath, originalContent);

// Step 3: Scrub everything
let content = await file(bundlePath).text();
console.log("🧹 Scrubbing all absolute paths...");

// 注入安全函数
const injection = `
const __dummy_resolve = (p) => {
    if (typeof p !== 'string') return ".";
    if (p.includes('package.json') || p.startsWith('/') || p.startsWith('\\\\')) return ".";
    try { return require.resolve(p); } catch(e) { return "."; }
};
`;
content = injection + content;

// 正则替换：任何包含 Users 且包含 node_modules 的字符串路径
// 匹配: "/Users/runner/work/.../node_modules/..."
// 替换为: "./node_modules/..."
content = content.replace(/"\/Users\/.*?\/(node_modules\/.*?)"/g, '"./$1"');
content = content.replace(/'\/Users\/.*?\/(node_modules\/.*?)'/g, "'./$1'");

// 暴力抹除残留的构建路径字符串
const G_ROOT = "/Users/runner/work/StockAI/StockAI";
content = content.split(G_ROOT).join(".");
content = content.split(projectRoot).join(".");

await write(bundlePath, content);

// Step 4: Compile
const proc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const exitCode = await proc.exited;
if (exitCode !== 0) process.exit(1);

console.log(`🎉 Success: ${outfile}`);
