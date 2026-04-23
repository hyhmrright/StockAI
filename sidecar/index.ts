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

// 强制静态导入以确保 Bun Bundler 能够追踪并包含依赖
// 虽然我们下面使用了动态 import() 来保证启动稳定性，
// 但静态引用能确保这些模块被打包进二进制。
import "playwright-core";

async function run() {
  const { resolveConfig } = await import('./configResolver');
  const { Handlers } = await import('./cli-handlers');

  const args = process.argv;
  logToFile(`Full Argv: ${JSON.stringify(args)}`);

  let action = args[2];
  let configStr = args[3] || '{}';

  if (action === '--list-models' || action === '--info' || action === '--search') {
    // ok
  } else if (!action || action.startsWith('{')) {
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
