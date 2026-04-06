import { performFullAnalysis } from './analysis';

/**
 * Sidecar CLI 入口点
 * 通过命令行参数解析配置并调用分析流程
 */
async function main() {
  const symbol = process.argv[2];
  const provider = process.argv[3] || 'openai';
  const apiKey = process.argv[4] || '';
  const baseUrl = process.argv[5] || '';
  const modelName = process.argv[6] || '';
  const deepMode = process.argv[7] !== 'false'; // 默认 true，仅字符串 "false" 时关闭
  
  if (!symbol) {
    console.error("使用方法: stockai-backend <SYMBOL> [provider] [apiKey] [baseUrl] [modelName] [deepMode]");
    process.exit(1);
  }

  try {
    // 执行完整分析 (抓取 + AI)
    // 这里的配置由 Tauri 端通过命令行参数注入
    const result = await performFullAnalysis(symbol, provider as any, {
      apiKey,
      baseUrl,
      model: modelName,
      deepMode,
    });
    
    // 将结果输出到标准输出，供 Tauri 捕获
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    // 将错误以 JSON 形式写入 stdout，确保前端能正确解析（而不是拿到空字符串）
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Sidecar 运行出错:", errorMessage);
    process.stdout.write(JSON.stringify({ error: errorMessage }));
    process.exit(0); // 错误已通过 JSON payload 传达，exit(0) 确保 Rust 侧能收到 stdout
  }
}

// 执行主函数
if (import.meta.main || (typeof process !== 'undefined' && process.argv[1] && (process.argv[1].endsWith('stockai-backend') || process.argv[1].endsWith('stockai-backend.exe')))) {
  main();
}
