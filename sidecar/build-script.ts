import * as path from "path";
import * as fs from "fs";
import { platform } from "os";

const projectRoot = path.resolve(import.meta.dir, "..");
const rawTarget = process.env.BUN_TARGET || "bun-darwin-arm64";
// 映射 Bun target 到 Rust/Tauri 三元组
const targetMap: Record<string, string> = {
    "bun-darwin-arm64": "aarch64-apple-darwin",
    "bun-darwin-x64": "x86_64-apple-darwin",
    "bun-linux-x64": "x86_64-unknown-linux-gnu",
    "bun-windows-x64": "x86_64-pc-windows-msvc"
};
const rustTriple = targetMap[rawTarget] || rawTarget.replace('bun-', '');
const outfile = process.env.OUTFILE || `src-tauri/bin/stockai-backend-${rustTriple}${rawTarget.includes('windows') ? '.exe' : ''}`;

console.log(`🚀 Starting FUNDAMENTAL FIX Build [v0.5.6]`);
console.log(`🎯 Bun Target: ${rawTarget}`);
console.log(`🦀 Rust Triple: ${rustTriple}`);
console.log(`📦 Outfile: ${outfile}`);

/**
 * 根本性解决方案 (Bun 1.2 + Tauri 2.0):
 * 1. 移除 --embed 逻辑，改为由 Tauri 将 browsers.json 打包到 Resources 目录（更符合 macOS 标准）。
 * 2. 在签名之前执行 chmod +x 和 xattr -cr，确保签名后的文件不被修改。
 * 3. 严格使用三元组命名规范。
 */

async function build() {
    // 确保输出目录存在
    const outDir = path.dirname(outfile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    console.log("🛠️  Compiling sidecar binary...");
    
    // Step 1: Bun Build & Compile
    const buildArgs = [
        "bun", "build", "sidecar/index.ts",
        "--compile",
        "--minify",
        // 移除 --embed，改用 Tauri Resources 机制
        "--target", rawTarget,
        "--outfile", outfile
    ];

    const proc = Bun.spawn(buildArgs, { 
        stdout: "inherit", 
        stderr: "inherit",
        env: {
            ...process.env,
            BUN_NO_CODESIGN_MACHO_BINARY: "1"
        }
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        console.error("❌ Bun compilation failed.");
        process.exit(1);
    }

    // Step 2: Verification
    console.log("🔍 Verifying sidecar binary...");
    const checkFile = Bun.file(outfile);
    if (!(await checkFile.exists())) {
        console.error("❌ Sidecar binary was not created.");
        process.exit(1);
    }
    console.log(`✅ Binary size: ${(checkFile.size / 1024 / 1024).toFixed(2)} MB`);

    // Step 3: macOS Pre-signing Prep & Signing
    if (platform() === 'darwin' || rustTriple.includes('apple-darwin')) {
        let signingIdentity = process.env.APPLE_SIGNING_IDENTITY || "-";
        
        if (signingIdentity.startsWith('"') && signingIdentity.endsWith('"')) {
            signingIdentity = signingIdentity.substring(1, signingIdentity.length - 1);
        }

        console.log(`🍎 macOS Build: Preparing and signing...`);
        
        // 重要：在签名之前设置执行权限和清除属性
        console.log("🔓 Setting permissions and clearing attributes...");
        Bun.spawnSync(["chmod", "+x", outfile]);
        Bun.spawnSync(["xattr", "-cr", outfile]);

        console.log(`🆔 Identity: ${signingIdentity === "-" ? "Ad-hoc (-)" : signingIdentity}`);
        
        const entitlementsPath = path.join(projectRoot, "src-tauri/Entitlements.plist");
        
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
            console.warn(`⚠️ Sidecar signing failed.`);
            console.warn(signProc.stderr.toString());
        } else {
            console.log(`✅ Sidecar codesign applied. Verifying...`);
            const verifyProc = Bun.spawnSync(["codesign", "-vvv", "--deep", "--strict", outfile]);
            if (verifyProc.exitCode !== 0) {
                console.warn(`⚠️ Sidecar signature verification failed.`);
            } else {
                console.log(`✨ Sidecar signature verified successfully.`);
            }
        }
    }

    console.log(`🎉 Final result: ${outfile}`);
}

build().catch(err => {
    console.error(`Build crash: ${err.message}`);
    process.exit(1);
});
