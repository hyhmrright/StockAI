import { performFullAnalysis } from './analysis';
import { Ollama } from 'ollama';

/**
 * Sidecar 配置接口（与 Rust AppConfig 的 JSON 序列化格式对应）
 */
interface SidecarConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  deepMode: boolean;
}

/**
 * Sidecar CLI 入口点
 * 参数格式: stockai-backend <symbol|action> <configJSON>
 */
async function main() {
  const symbolOrAction = process.argv[2];

  if (!symbolOrAction) {
    console.error("使用方法: stockai-backend <SYMBOL|ACTION> <configJSON>");
    process.exit(1);
  }

  // 解析 JSON 配置（第二个参数）
  const rawConfig = process.argv[3] || '{}';
  let config: Partial<SidecarConfig>;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    console.error("配置 JSON 解析失败:", rawConfig);
    config = {};
  }

  // 支持获取模型列表动作
  if (symbolOrAction === '--list-models') {
    const provider = config.provider || 'ollama';
    const baseUrl = config.baseUrl || 'http://localhost:11434';

    try {
      if (provider === 'ollama') {
        const ollama = new Ollama({ host: baseUrl });
        const list = await ollama.list();
        console.log(JSON.stringify({ models: list.models.map(m => m.name) }));
      } else {
        // 对于 OpenAI 等，返回常用默认值
        console.log(JSON.stringify({ models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] }));
      }
      process.exit(0);
    } catch (error) {
      console.log(JSON.stringify({ error: (error as Error).message }));
      process.exit(0);
    }
  }

  const provider = config.provider || 'openai';
  const apiKey = config.apiKey || '';
  const baseUrl = config.baseUrl || '';
  const modelName = config.modelName || '';
  const deepMode = config.deepMode !== false;

  try {
    // 执行完整分析 (抓取 + AI)
    const result = await performFullAnalysis(symbolOrAction, provider, {
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
