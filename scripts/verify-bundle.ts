import { readFileSync } from 'fs';

/**
 * 验证打包后的二进制文件是否泄露了绝对路径 (如 /Users/runner 或 StockAI 源码路径)
 * 
 * 此脚本由 Task 4 (Verification Tooling) 创建，用于确保打包后的 Sidecar 二进制
 * 不包含任何指向构建机或开发机的绝对路径，以保证可移植性和安全性。
 */
function verifyBundle() {
  const targetPath = process.argv[2];

  if (!targetPath) {
    console.error("❌ 请提供目标文件路径");
    console.error("用法: bun scripts/verify-bundle.ts <path>");
    process.exit(1);
  }

  console.log(`🔍 正在验证二进制文件: ${targetPath}`);

  try {
    const buffer = readFileSync(targetPath);
    
    // 我们检查这些敏感字符串
    const sensitivePatterns = [
      { pattern: "/Users/runner", description: "CI 运行路径 (GitHub Actions)" },
      { pattern: "/Users/", description: "用户目录路径" },
      { pattern: "StockAI", description: "项目源码路径关键字" },
    ];

    let foundLeak = false;

    for (const item of sensitivePatterns) {
      const patternBuffer = Buffer.from(item.pattern);
      let count = 0;
      let lastIndex = -1;
      
      while (true) {
        let index = buffer.indexOf(patternBuffer, lastIndex + 1);
        if (index === -1) break;
        
        count++;
        if (count === 1) {
          console.warn(`⚠️ 发现潜在路径泄露 [${item.description}]: "${item.pattern}"`);
        }
        
        // 仅显示前 3 个位置的上下文，避免输出过多
        if (count <= 3) {
          const contextStart = Math.max(0, index - 30);
          const contextEnd = Math.min(buffer.length, index + 50);
          const context = buffer.slice(contextStart, contextEnd).toString('utf8').replace(/[\x00-\x1F\x7F-\xFF]/g, '.');
          console.warn(`   [#${count}] 位置: ${index} (0x${index.toString(16)})`);
          console.warn(`   上下文: ...${context}...`);
        }
        
        lastIndex = index;
        foundLeak = true;
      }
      
      if (count > 3) {
        console.warn(`   ... 还有 ${count - 3} 处相同的泄露`);
      }
    }

    if (!foundLeak) {
      console.log("✅ 验证通过：未在二进制文件中发现明显的绝对路径泄露");
      process.exit(0);
    } else {
      console.error("\n❌ 验证失败：检测到绝对路径泄露");
      console.log("建议：检查构建配置，确保使用了相对路径或在打包时进行了路径剥离。");
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ 验证过程中出错: ${error.message}`);
    process.exit(1);
  }
}

verifyBundle();
