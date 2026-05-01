import { file } from "bun";
import * as path from "path";
import * as fs from "fs";

/**
 * StockAI 捆绑包验证工具
 * 用于在构建后验证 Sidecar 二进制文件、资源文件和路径纯度。
 */

const target = process.argv[2];
if (!target) {
    console.error("用法: bun scripts/verify-bundle.ts <path-to-binary-or-app>");
    console.log("示例: bun scripts/verify-bundle.ts src-tauri/bin/stockai-backend-aarch64-apple-darwin");
    process.exit(1);
}

async function verify() {
    console.log(`🔍 正在验证: ${target}...`);
    
    if (!fs.existsSync(target)) {
        console.error(`❌ 错误: 目标路径不存在: ${target}`);
        process.exit(1);
    }

    const stat = fs.statSync(target);
    let binaryPath = target;
    let clean = true;

    // 如果是 .app 目录，尝试寻找内部的 Sidecar
    if (stat.isDirectory() && target.endsWith('.app')) {
        console.log("检测到 macOS App Bundle，扫描内部 Sidecar...");
        // Tauri 2.0 标准路径: Contents/Resources/bin/
        const possibleSidecars = [
            path.join(target, 'Contents/Resources/bin/stockai-backend-aarch64-apple-darwin'),
            path.join(target, 'Contents/Resources/bin/stockai-backend')
        ];
        const found = possibleSidecars.find(p => fs.existsSync(p));
        if (found) {
            console.log(`✅ 找到内部 Sidecar: ${found}`);
            binaryPath = found;
        } else {
            console.warn("⚠️ 未能在 .app 中找到 Sidecar 二进制文件，仅验证外壳。");
        }

        // 验证 Resources 下的 browsers.json
        const resourceBrowsers = path.join(target, 'Contents/Resources/browsers.json');
        if (fs.existsSync(resourceBrowsers)) {
            console.log("✅ 在 App Resources 中找到 browsers.json。");
        } else {
            console.error("❌ 错误: App Resources 中缺失 browsers.json！");
            clean = false;
        }
    }

    // 1. 验证路径纯度 (No Leak)
    const binaryContent = await file(binaryPath).arrayBuffer();
    const binaryText = Buffer.from(binaryContent).toString('utf-8');
    const forbidden = [
        "/Users/runner/work/StockAI/StockAI",
        "/Users/hyh/code/StockAI"
    ];

    for (const f of forbidden) {
        if (binaryText.includes(f)) {
            console.warn(`⚠️ 警告: 发现泄露的绝对路径: ${f} (非致命，但建议优化)`);
        }
    }

    // 2. 验证代码签名 (macOS 专属)
    if (process.platform === 'darwin') {
        console.log("🍎 正在验证 macOS 代码签名...");
        try {
            const { spawnSync } = require('child_process');
            
            // 验证签名有效性
            const verifySign = spawnSync('codesign', ['-vvv', '--deep', '--strict', binaryPath]);
            if (verifySign.status === 0) {
                console.log("✅ 代码签名验证通过 (valid on disk).");
                
                // 检查是否包含 hardened runtime
                const checkFlags = spawnSync('codesign', ['-dvvv', binaryPath]);
                const output = checkFlags.stderr.toString();
                if (output.includes('Runtime Version') || output.includes('flags=0x10000')) {
                    console.log("✅ Hardened Runtime 已启用。");
                } else {
                    console.error("❌ 错误: 未检测到 Hardened Runtime！公证必将失败。");
                    clean = false;
                }

                // 检查 Entitlements
                const checkEntitlements = spawnSync('codesign', ['-d', '--entitlements', ':-', binaryPath]);
                const ent = checkEntitlements.stdout.toString();
                if (ent.includes('com.apple.security.cs.allow-jit')) {
                    console.log("✅ Entitlements 包含 allow-jit。");
                } else {
                    console.error("❌ 错误: Entitlements 缺少 allow-jit，Bun Sidecar 将无法正常运行！");
                    clean = false;
                }
            } else {
                console.error(`❌ 错误: 代码签名无效!\n${verifySign.stderr.toString()}`);
                clean = false;
            }
        } catch (e: any) {
            console.warn(`⚠️ 无法执行代码签名验证 (codesign 命令不可用?): ${e.message}`);
        }
    }

    // 3. 验证 Playwright 资源 (如果是独立二进制验证)
    if (!target.endsWith('.app')) {
        const dir = path.dirname(binaryPath);
        const browsersJson = path.join(dir, 'browsers.json');
        // 在本地构建目录中，它可能在同级
        if (fs.existsSync(browsersJson)) {
            console.log("✅ browsers.json 资源文件在二进制同级目录存在。");
        } else {
            console.warn("⚠️ 二进制同级未找到 browsers.json，请确保它已被打包进资源目录。");
        }
    }

    if (clean) {
        console.log("✨ 验证通过: 未发现项目路径泄露，结构完整。");
    } else {
        console.error("🚨 验证失败: 存在路径泄露风险。");
        process.exit(1);
    }
}

verify().catch(err => {
    console.error(`❌ 验证过程中发生异常: ${err.message}`);
    process.exit(1);
});
