import { logger, toErrorMessage, outputJson, logToFile } from './utils';

// 全局异常捕获，确保即使是异步崩溃也能输出 JSON 错误
// 必须在任何其他导入之前设置，以防导入本身崩溃
process.on('uncaughtException', (err) => {
  const msg = toErrorMessage(err);
  logger.error(`[FATAL] 未捕获的异常: ${msg}`);
  outputJson({ error: { code: 'ERR_UNCAUGHT', message: `内部致命错误: ${msg}` } });
  // 给予足够的时间让 fs.writeSync 完成
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = toErrorMessage(reason);
  logger.error(`[FATAL] 未处理的 Promise 拒绝: ${msg}`);
  outputJson({ error: { code: 'ERR_UNHANDLED', message: `内部异步错误: ${msg}` } });
  process.exit(1);
});

import { resolveConfig } from './configResolver';
import { Handlers } from './cli-handlers';

/**
 * Sidecar CLI 入口点
 * 参数格式: stockai-backend <symbol|action> <configJSON>
 */
async function main() {
  logToFile(`argv: ${JSON.stringify(process.argv)}`);
  
  // 更加鲁棒的参数解析
  const args = process.argv.slice(2);
  let symbolOrAction = '';
  let rawConfigStr = '{}';

  if (args.length >= 1) {
    symbolOrAction = args[0];
  }
  if (args.length >= 2) {
    rawConfigStr = args[1];
  }

  logger.info(`Sidecar 启动: action=${symbolOrAction}, config_len=${rawConfigStr.length}`);

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
}

main().then(() => {
  // 正常结束
  process.exit(0);
}).catch(err => {
  const errorMessage = toErrorMessage(err);
  logger.error("主流程异常: " + errorMessage);
  outputJson({ error: { code: 'ERR_FATAL', message: `内部错误: ${errorMessage}` } });
  process.exit(1);
});
