/**
 * Sidecar stdout 协议约定：
 * 每次进程运行只允许向 stdout 写入一次 JSON 行（通过 outputJson()）。
 * 所有调试信息通过 stderr（logger.*）输出。
 * Rust 层从 stdout 取最后一行非空内容作为响应。
 */

import { performFullAnalysis } from './analysis';
import { Ollama } from 'ollama';
import { toErrorMessage, logger, outputJson } from './utils';
import { resolveConfig } from './configResolver';
import { DEFAULT_OPENAI_MODELS } from './config';

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

  // 解析配置，版本不兼容时直接返回错误
  let config;
  try {
    config = resolveConfig(rawConfig);
  } catch (error) {
    outputJson({ error: toErrorMessage(error) });
    return;
  }

  // 支持获取模型列表动作
  if (symbolOrAction === '--list-models') {
    try {
      if (config.provider === 'ollama') {
        const ollama = new Ollama({ host: config.baseUrl });
        const list = await ollama.list();
        outputJson({ models: list.models.map(m => m.name) });
      } else {
        // 对于 OpenAI 等，返回常用默认值
        outputJson({ models: DEFAULT_OPENAI_MODELS });
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
