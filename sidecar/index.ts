import { logger, toErrorMessage, outputJson } from './utils';
import { resolveConfig } from './configResolver';
import { Handlers } from './cli-handlers';

/**
 * Sidecar CLI 入口点
 * 参数格式: stockai-backend <symbol|action> <configJSON>
 */
async function main() {
  const symbolOrAction = process.argv[2];
  const rawConfigStr = process.argv[3] || '{}';

  if (!symbolOrAction) {
    logger.error("使用方法: stockai-backend <SYMBOL|ACTION> <configJSON>");
    process.exit(1);
  }

  // 解析 JSON 配置
  let rawConfig: any;
  try {
    rawConfig = JSON.parse(rawConfigStr);
  } catch {
    logger.error("配置 JSON 解析失败: " + rawConfigStr);
    rawConfig = {};
  }

  // 路由分发
  switch (symbolOrAction) {
    case '--list-models':
      await Handlers.handleListModels(rawConfig);
      break;

    case '--info':
      await Handlers.handleInfo(process.argv[4]);
      break;

    case '--search':
      await Handlers.handleSearch(process.argv[4]);
      break;

    default:
      // 默认视为完整分析动作，第一个参数为 symbol
      try {
        const config = resolveConfig(rawConfig);
        await Handlers.handleAnalysis(symbolOrAction, config);
      } catch (error) {
        outputJson({ error: { code: 'ERR_CONFIG', message: toErrorMessage(error) } });
      }
      break;
  }

  process.exit(0);
}

main().catch(err => {
  const errorMessage = toErrorMessage(err);
  logger.error("致命错误: " + errorMessage);
  outputJson({ error: { code: 'ERR_FATAL', message: `内部错误: ${errorMessage}` } });
  process.exit(1);
});
