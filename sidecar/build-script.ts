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

// C. 抹除所有路径模式 (包括转义路径)
const pathsToScrub = [
    projectRoot,
    projectRoot.replace(/\//g, "\\\\"),
    "/Users/runner/work/StockAI/StockAI",
    "/Users/runner/work",
    "Users/runner/work",
    path.dirname(projectRoot),
    "/Users/hyh" // Local dev path scrubbing
];

console.log("🧼 Applying aggressive scrubbing...");
for (const p of pathsToScrub) {
    if (p && p.length > 2) {
        content = content.split(p).join(".");
    }
}

// D. 特殊处理 Playwright 的 coreDir
// 强制指向二进制所在目录
content = content.replace(/var coreDir = .*?;/g, 'var coreDir = import.meta.dir;');
content = content.replace(/const coreDir = .*?;/g, 'const coreDir = import.meta.dir;');

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

// Proactive signing for macOS
if (process.platform === 'darwin') {
  const signingIdentity = process.env.APPLE_SIGNING_IDENTITY || "-";
  console.log(`🍎 macOS detected: Performing proactive signing with identity: ${signingIdentity}`);
  
  const entitlementsPath = path.join(projectRoot, "src-tauri/Entitlements.plist");
  const signArgs = [
    "codesign", "--force",
    "--options", "runtime",
    "--entitlements", entitlementsPath,
    "--sign", signingIdentity,
    outfile
  ];
  
  const signProc = Bun.spawn(signArgs);
  const signExitCode = await signProc.exited;
  if (signExitCode !== 0) {
    console.error(`❌ Sidecar signing failed with exit code ${signExitCode}.`);
    process.exit(1);
  }
  console.log(`✅ Sidecar signed successfully (${signingIdentity === "-" ? "ad-hoc" : "identity-based"}).`);
}

// Step 5: Copy browsers.json to the same directory as the binary
// 这确保 Playwright 在运行时能找到版本定义文件
// 对于 Tauri 来说，这会被打包到 Resources 目录中
const browsersJsonPath = path.join(projectRoot, "node_modules/playwright-core/browsers.json");
const targetBrowsersJson = path.join(path.dirname(outfile), "browsers.json");

console.log(`📂 Ensuring browsers.json at: ${targetBrowsersJson}`);
if (fs.existsSync(browsersJsonPath)) {
    fs.copyFileSync(browsersJsonPath, targetBrowsersJson);
    console.log(`✅ browsers.json copied successfully.`);
} else {
    // 降级方案：如果 node_modules 找不到，尝试从本地 src-tauri/bin 找 (可能上次构建留下的)
    const localFallback = path.join(projectRoot, "src-tauri/bin/browsers.json");
    if (fs.existsSync(localFallback) && localFallback !== targetBrowsersJson) {
        fs.copyFileSync(localFallback, targetBrowsersJson);
        console.log(`⚠️ Using local fallback for browsers.json`);
    } else if (!fs.existsSync(targetBrowsersJson)) {
        console.error(`❌ CRITICAL: browsers.json not found! Playwright will fail.`);
    }
}

// Step 6: 严苛完整性自检 (Integrity Check)
const binaryContent = await file(outfile).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');

// 我们只关心项目路径泄露。Bun 运行时内部可能包含它自己的构建机器路径 (如 /Users/administrator/...)，这些是可以接受的。
const forbiddenPatterns = [
    projectRoot,
    "/Users/runner/work/StockAI/StockAI",
    "/Users/hyh/code/StockAI"
];
let hasLeak = false;

console.log("🔍 Running integrity check for project path leaks...");
for (const pattern of forbiddenPatterns) {
    if (pattern && pattern.length > 5 && binaryText.includes(pattern)) {
        console.error(`❌ CRITICAL FAILURE: Project path pattern "${pattern}" detected in binary!`);
        hasLeak = true;
    }
}

// 额外的启发式检查：如果包含 /Users/ 且包含 StockAI，则极大概率是泄露
if (binaryText.includes("/Users/") && binaryText.includes("/StockAI/")) {
    console.error(`❌ CRITICAL FAILURE: Potential project path leak detected (/Users/.../StockAI/...)`);
    hasLeak = true;
}

if (hasLeak) {
    console.error("🚨 Build failed: Binary contains absolute project path leaks.");
    process.exit(1);
}

console.log("✨ Binary is PURE (No project path leaks found).");

console.log(`🎉 Final result: ${outfile}`);
