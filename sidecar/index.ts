import { performFullAnalysis } from './analysis';
import { Ollama } from 'ollama';
import { toErrorMessage } from './utils';

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
        // 用 write 替代 console.log，确保 pipe 模式下 stdout 立即刷新
        process.stdout.write(JSON.stringify({ models: list.models.map(m => m.name) }) + '\n');
      } else {
        // 对于 OpenAI 等，返回常用默认值
        process.stdout.write(JSON.stringify({ models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] }) + '\n');
      }
    } catch (error) {
      process.stdout.write(JSON.stringify({ error: toErrorMessage(error) }) + '\n');
    }
    return;
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

    // 用 write 替代 console.log，确保 pipe 模式下 stdout 立即刷新后再退出
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    console.error("Sidecar 运行出错:", errorMessage);
    process.stdout.write(JSON.stringify({ error: errorMessage }) + '\n');
  }
}

main().catch(err => {
  const errorMessage = toErrorMessage(err);
  console.error("致命错误:", errorMessage);
  // 顶层异常也输出 JSON，确保前端不会收到空响应
  process.stdout.write(JSON.stringify({ error: `内部错误: ${errorMessage}` }) + '\n');
});
