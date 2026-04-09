import { performFullAnalysis } from './analysis';
import { Ollama } from 'ollama';
import { toErrorMessage, logger, outputJson } from './utils';
import { PROVIDER_DEFAULTS } from './config';

/**
 * 从原始配置对象中提取有效的 Provider 配置
 */
function resolveConfig(raw: any) {
  // 1. 确定当前活跃的 Provider
  const provider = (raw.activeProvider || raw.provider || raw.model || 'ollama') as keyof typeof PROVIDER_DEFAULTS;
  
  // 2. 获取该 Provider 的配置 (优先从新格式 providerConfigs 中获取)
  const providerCfg = raw.providerConfigs?.[provider] || {};
  
  // 3. 提取各个字段 (兼容旧格式直接存储在根对象的情况)
  const apiKey = providerCfg.apiKey || raw.apiKey || '';
  const baseUrl = providerCfg.baseUrl || raw.baseUrl || PROVIDER_DEFAULTS[provider]?.baseUrl || '';
  const modelName = providerCfg.model || raw.aiModel || raw.modelName || PROVIDER_DEFAULTS[provider]?.model || '';
  const deepMode = raw.deepMode !== false; // 默认为开启

  return {
    provider,
    apiKey,
    baseUrl,
    modelName,
    deepMode
  };
}

/**
 * Sidecar CLI 入口点
 * 参数格式: stockai-backend <symbol|action> <configJSON>
 */
async function main() {
  const symbolOrAction = process.argv[2];

  if (!symbolOrAction) {
    logger.error("使用方法: stockai-backend <SYMBOL|ACTION> <configJSON>");
    process.exit(1);
  }

  // 解析 JSON 配置（第二个参数）
  const rawConfigStr = process.argv[3] || '{}';
  let rawConfig: any;
  try {
    rawConfig = JSON.parse(rawConfigStr);
  } catch {
    logger.error("配置 JSON 解析失败: " + rawConfigStr);
    rawConfig = {};
  }

  // 使用统一的逻辑解析配置
  const config = resolveConfig(rawConfig);

  // 支持获取模型列表动作
  if (symbolOrAction === '--list-models') {
    try {
      if (config.provider === 'ollama') {
        const ollama = new Ollama({ host: config.baseUrl });
        const list = await ollama.list();
        outputJson({ models: list.models.map(m => m.name) });
      } else {
        // 对于 OpenAI 等，返回常用默认值
        outputJson({ models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] });
      }
    } catch (error) {
      outputJson({ error: toErrorMessage(error) });
    }
    return;
  }

  try {
    // 执行完整分析 (抓取 + AI)
    const result = await performFullAnalysis(symbolOrAction, config.provider, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.modelName,
      deepMode: config.deepMode,
    });

    outputJson(result);
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error("Sidecar 运行出错: " + errorMessage);
    outputJson({ error: errorMessage });
  }
}

main().catch(err => {
  const errorMessage = toErrorMessage(err);
  logger.error("致命错误: " + errorMessage);
  outputJson({ error: `内部错误: ${errorMessage}` });
});
