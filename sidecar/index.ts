import { performFullAnalysis } from './analysis';

/**
 * Sidecar CLI 入口点
 * 处理命令行参数并调用分析流程
 */
async function main() {
  const symbol = process.argv[2];
  
  if (!symbol) {
    console.error("使用方法: stockai-backend <SYMBOL>");
    process.exit(1);
  }

  try {
    // 执行完整分析 (抓取 + AI)
    // 默认使用 OpenAI，如果需要切换可以在此处读取环境变量或配置
    const result = await performFullAnalysis(symbol);
    
    // 将结果输出到标准输出，供 Tauri 捕获
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error("Sidecar 运行出错:", error);
    process.exit(1);
  }
}

// 执行主函数
if (import.meta.main || (typeof process !== 'undefined' && process.argv[1] && (process.argv[1].endsWith('stockai-backend') || process.argv[1].endsWith('stockai-backend.exe')))) {
  main();
}
