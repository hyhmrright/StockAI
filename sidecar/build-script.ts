import * as path from "path";
import * as fs from "fs";
import { platform } from "os";

const projectRoot = path.resolve(import.meta.dir, "..");
const target = process.env.BUN_TARGET || "bun-darwin-arm64";
const outfile = process.env.OUTFILE || `src-tauri/bin/stockai-backend-${target.replace('bun-', '')}`;

console.log(`🚀 Starting FUNDAMENTAL FIX Build [v0.5.5]`);
console.log(`🎯 Target: ${target}`);
console.log(`📦 Outfile: ${outfile}`);

/**
 * 根本性解决方案 (Bun 1.2 + Tauri 2.0):
 * 1. 使用 Bun 1.2 的 --embed 功能直接嵌入 browsers.json。
 * 2. 代码中使用 Bun.main 探测路径，不再依赖脆弱的字符串替换或 __dirname。
 * 3. 简化构建流程，移除 esbuild 预打包和复杂的二进制抹除。
 */

async function build() {
    // 确保输出目录存在
    const outDir = path.dirname(outfile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Step 1: Bun Build & Compile
    console.log("🛠️  Compiling sidecar with --embed...");
    
    // 我们需要确保 browsers.json 存在
    const browsersJsonSrc = path.join(projectRoot, "node_modules/playwright-core/browsers.json");
    const localBrowsersJson = path.join(projectRoot, "sidecar/browsers.json");
    
    // 同步到 sidecar 目录以便 --embed 寻找
    if (fs.existsSync(browsersJsonSrc)) {
        fs.copyFileSync(browsersJsonSrc, localBrowsersJson);
        console.log("✅ Synchronized browsers.json for embedding");
    }

    const buildArgs = [
        "bun", "build", "sidecar/index.ts",
        "--compile",
        "--minify",
        "--embed", "sidecar/browsers.json",
        "--target", target,
        "--outfile", outfile
    ];

    const proc = Bun.spawn(buildArgs, { stdout: "inherit", stderr: "inherit" });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        console.error("❌ Bun compilation failed.");
        process.exit(1);
    }

    // Step 1.5: Copy browsers.json as fallback (for local dev/test)
    const targetBrowsersJson = path.join(path.dirname(outfile), "browsers.json");
    fs.copyFileSync(localBrowsersJson, targetBrowsersJson);
    console.log(`✅ Fallback browsers.json copied to ${targetBrowsersJson}`);

    // Step 2: Verification (No modification of binary!)
    console.log("🔍 Verifying sidecar structure...");
    const checkFile = Bun.file(outfile);
    if (!(await checkFile.exists())) {
        console.error("❌ Sidecar binary was not created.");
        process.exit(1);
    }
    console.log(`✅ Binary size: ${(checkFile.size / 1024 / 1024).toFixed(2)} MB`);

    // Step 3: macOS Proactive Signing (ONLY for local dev or if identity is provided)
    if (platform() === 'darwin' || target.includes('apple-darwin')) {
        let signingIdentity = process.env.APPLE_SIGNING_IDENTITY || "-";
        
        // 清洗 Identity
        if (signingIdentity.startsWith('"') && signingIdentity.endsWith('"')) {
            signingIdentity = signingIdentity.substring(1, signingIdentity.length - 1);
        }

        console.log(`🍎 macOS Build: Performing proactive signing...`);
        console.log(`🆔 Identity: ${signingIdentity === "-" ? "Ad-hoc (-)" : signingIdentity}`);
        
        const entitlementsPath = path.join(projectRoot, "src-tauri/Entitlements.plist");
        
        // 根本性修复：在签名之前移除所有扩展属性（解决 Damaged 错误的核心）
        console.log("🧹 Removing extended attributes (xattr -cr)...");
        Bun.spawnSync(["xattr", "-cr", outfile]);

        const signArgs = [
            "codesign", "--force",
            "--options", "runtime",
            "--timestamp", 
            "--entitlements", entitlementsPath,
            "--sign", signingIdentity,
            outfile
        ];
        
        const signProc = Bun.spawnSync(signArgs);
        if (signProc.exitCode !== 0) {
            console.warn(`⚠️ Sidecar signing failed (non-critical if followed by Tauri build).`);
            console.warn(signProc.stderr.toString());
        } else {
            console.log(`✅ Sidecar codesign applied. Verifying...`);
            const verifyProc = Bun.spawnSync(["codesign", "-vvv", "--deep", "--strict", outfile]);
            if (verifyProc.exitCode !== 0) {
                console.warn(`⚠️ Sidecar signature verification failed (non-critical).`);
            } else {
                console.log(`✨ Signature verified successfully.`);
            }
        }
    }

    console.log(`🎉 Final result: ${outfile}`);
}

build().catch(err => {
    console.error(`Build crash: ${err.message}`);
    process.exit(1);
});
