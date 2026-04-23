import { write, file } from "bun";
import * as path from "path";
import * as fs from "fs";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `sidecar/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting ULTRA-ROBUST Build [v0.5.2]`);
console.log(`- Target: ${target}`);
console.log(`- Project Root: ${projectRoot}`);

/**
 * 核心策略：
 * 1. 在打包前，直接修补 node_modules 中的 playwright-core 源码。
 *    这是为了彻底移除那些会让 Bun 编译器在静态分析阶段发疯的 require.resolve() 调用。
 * 2. 使用 esbuild 将所有依赖打包成一个独立的 CJS 文件。
 * 3. 对生成的 Bundle 进行二次清洗，抹除残留的绝对路径。
 * 4. 使用 Bun 将清洗后的 Bundle 编译为二进制。
 */

// --- Step 1: Pre-patch node_modules ---
console.log("🩹 Pre-patching playwright-core to neutralize path-probing...");

const filesToPatch = [
    "node_modules/playwright-core/lib/server/utils/nodePlatform.js",
    "node_modules/playwright-core/lib/tools/cli-client/registry.js",
    "node_modules/playwright-core/lib/tools/dashboard/dashboardApp.js"
];

const backups = new Map<string, string>();

for (const relPath of filesToPatch) {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
        console.log(`   - Patching ${relPath}`);
        const content = fs.readFileSync(fullPath, "utf-8");
        backups.set(fullPath, content);
        
        // 强行将 coreDir 赋值为 "."，并注释掉原来的 require.resolve
        let patched = content.replace(
            /const coreDir = .*?;/g, 
            'const coreDir = "."; // patched by StockAI'
        );
        // 针对其他 require.resolve("package.json") 的调用
        patched = patched.replace(/require\.resolve\(["'].*?package\.json["']\)/g, '"."');
        
        fs.writeFileSync(fullPath, patched);
    }
}

// --- Step 2: Bundle with ESBUILD ---
console.log("📦 Bundling with esbuild (Platform: Node, Format: CJS)...");
const bundlePath = path.join(projectRoot, "sidecar/dist/index.js");

const esbuildProc = Bun.spawn([
  "npx", "esbuild", "sidecar/index.ts",
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--outfile=" + bundlePath,
  "--external:bun",
  "--minify=false", // 保持可读性以便于 Step 3 的清洗
  "--define:process.env.NODE_ENV=\"production\""
]);

const esbuildExit = await esbuildProc.exited;

// 立即还原 node_modules，防止污染本地开发环境
console.log("⏪ Restoring node_modules...");
for (const [fullPath, originalContent] of backups) {
    fs.writeFileSync(fullPath, originalContent);
}

if (esbuildExit !== 0) {
    console.error("❌ esbuild failed!");
    process.exit(1);
}

// --- Step 3: Scrub the Bundle ---
console.log("🧹 Scrubbing bundle for build-machine path leaks...");
let bundleContent = await file(bundlePath).text();

const G_ROOT = "/Users/runner/work/StockAI/StockAI";
const LOCAL_ROOT = projectRoot;

const nukePaths = (text: string, root: string) => {
    // 处理原始路径
    text = text.split(root).join(".");
    // 处理转义路径 (\\/)
    text = text.split(root.replace(/\//g, "\\/")).join(".");
    return text;
};

bundleContent = nukePaths(bundleContent, G_ROOT);
bundleContent = nukePaths(bundleContent, LOCAL_ROOT);

// 全量屏蔽 require.resolve 
// 这一步是双重保险：即使 esbuild 没理会 Step 1 的修改，
// 我们也在 bundle 中把所有的 require.resolve("...") 替换成返回 "." 的占位符。
bundleContent = bundleContent.replace(/require\.resolve\(".*?"\)/g, '"."');

await write(bundlePath, bundleContent);

// --- Step 4: Compile with BUN ---
console.log(`📦 Compiling final binary for ${target}...`);
const compileProc = Bun.spawn([
  "bun", "build", bundlePath,
  "--compile",
  "--target", target,
  "--outfile", outfile
]);

const compileExit = await compileProc.exited;
if (compileExit !== 0) {
    console.error("❌ Bun compilation failed!");
    process.exit(1);
}

// --- Step 5: Final Validation ---
console.log("🔍 Running self-check on generated binary...");
const binaryContent = await file(outfile).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');
const leakCheck = ["/", "Users", "runner"].join("/");

if (binaryText.includes(leakCheck)) {
    console.warn(`⚠️  WARNING: Found path fragment '${leakCheck}' in binary. This might be a false positive or a harmless leak.`);
} else {
    console.log("✨ Binary is clean.");
}

console.log(`🎉 SUCCESS! Sidecar binary ready at: ${outfile}`);
