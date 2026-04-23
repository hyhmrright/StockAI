import { logger, toErrorMessage, outputJson, logToFile } from './utils';

/**
 * 紧急入口点：确保错误拦截器在任何业务逻辑加载前运行。
 */
process.on('uncaughtException', (err) => {
  const msg = toErrorMessage(err);
  logger.error(`[CRITICAL] 未捕获异常: ${msg}`);
  outputJson({ error: { code: 'ERR_BOOT_CRASH', message: `启动崩溃: ${msg}` } });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = toErrorMessage(reason);
  logger.error(`[CRITICAL] Promise 拒绝: ${msg}`);
  outputJson({ error: { code: 'ERR_BOOT_ASYNC', message: `异步启动失败: ${msg}` } });
  process.exit(1);
});

async function run() {
  // 业务逻辑动态导入，防止 top-level import 崩溃
  const { resolveConfig } = await import('./configResolver');
  const { Handlers } = await import('./cli-handlers');

  const args = process.argv;
  logToFile(`Full Argv: ${JSON.stringify(args)}`);

  // 如果筛选后没参数，说明是 Sidecar 模式或直接运行
  // 在 Sidecar 模式下，Tauri 传入的参数通常在 argv[2] 之后
  let action = args[2];
  let configStr = args[3] || '{}';

  // 针对 --list-models 等特殊 Action 的补丁解析
  if (action === '--list-models' || action === '--info' || action === '--search') {
    // 保持现状
  } else if (!action || action.startsWith('{')) {
    // 可能是索引偏移了
    action = args[1];
    configStr = args[2] || '{}';
  }

  logger.info(`Sidecar 执行: action=${action}, config_len=${configStr.length}`);

  if (!action) {
    logger.error("未提供有效 Action");
    process.exit(1);
  }

  let rawConfig: any;
  try {
    rawConfig = JSON.parse(configStr);
  } catch {
    rawConfig = {};
  }

  switch (action) {
    case '--list-models':
      await Handlers.handleListModels(rawConfig);
      break;
    case '--info':
      await Handlers.handleInfo(args[4] || args[3]);
      break;
    case '--search':
      await Handlers.handleSearch(args[4] || args[3]);
      break;
    default:
      try {
        const config = resolveConfig(rawConfig);
        await Handlers.handleAnalysis(action, config);
      } catch (error) {
        outputJson({ error: { code: 'ERR_CONFIG', message: toErrorMessage(error) } });
      }
      break;
  }
}

run().catch(err => {
  logger.error(`执行流异常: ${toErrorMessage(err)}`);
  outputJson({ error: { code: 'ERR_FATAL', message: toErrorMessage(err) } });
  process.exit(1);
});
