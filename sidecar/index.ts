import { performFullAnalysis } from './analysis';
import { Ollama } from 'ollama';

/**
 * Sidecar CLI 入口点
 * 通过命令行参数解析配置并调用分析流程
 */
async function main() {
  const symbolOrAction = process.argv[2];
  
  if (!symbolOrAction) {
    console.error("使用方法: stockai-backend <SYMBOL|ACTION> [provider] [apiKey] [baseUrl] [modelName] [deepMode]");
    process.exit(1);
  }

  // 支持获取模型列表动作
  if (symbolOrAction === '--list-models') {
    const provider = process.argv[3] || 'ollama';
    const baseUrl = process.argv[5] || 'http://localhost:11434';
    
    try {
      if (provider === 'ollama') {
        const ollama = new Ollama({ host: baseUrl });
        const list = await ollama.list();
        console.log(JSON.stringify({ models: list.models.map(m => m.name) }));
      } else {
        // 对于 OpenAI 等，可以返回一些常用默认值或通过 API 获取 (暂仅实现 Ollama)
        console.log(JSON.stringify({ models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] }));
      }
      process.exit(0);
    } catch (error) {
      console.log(JSON.stringify({ error: (error as Error).message }));
      process.exit(0);
    }
    return;
  }

  const provider = process.argv[3] || 'openai';
  const apiKey = process.argv[4] || '';
  const baseUrl = process.argv[5] || '';
  const modelName = process.argv[6] || '';
  const deepMode = process.argv[7] !== 'false';
  
  try {
    // 执行完整分析 (抓取 + AI)
    const result = await performFullAnalysis(symbolOrAction, provider as any, {
      apiKey,
      baseUrl,
      model: modelName,
      deepMode,
    });
    
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Sidecar 运行出错:", errorMessage);
    console.log(JSON.stringify({ error: errorMessage }));
    process.exit(0);
  }
}

main().catch(err => {
  console.error("致命错误:", err);
  process.exit(1);
});
