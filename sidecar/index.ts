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
  const args = process.argv;
  logToFile(`Full Argv: ${JSON.stringify(args)}`);

  // 更加鲁棒的参数寻找逻辑
  const isCheck = args.some(arg => arg === '--check');
  const isListModels = args.some(arg => arg === '--list-models');
  const isInfo = args.some(arg => arg === '--info');
  const isSearch = args.some(arg => arg === '--search');

  // 健康自检逻辑 - 优先运行
  if (isCheck) {
    logger.info("运行 Sidecar 健康自检...");
    try {
      const { BrowserManager } = await import('./browser-manager');
      const bm = new BrowserManager();
      const page = await bm.getPage();
      const title = await page.title();
      await bm.close();
      logger.info(`✅ 浏览器连接成功 (标题: "${title || '无'}")`);
      logger.info("✨ Sidecar 健康自检完成，环境正常。");
      process.exit(0);
    } catch (err) {
      logger.error(`❌ Sidecar 自检失败: ${toErrorMessage(err)}`);
      process.exit(1);
    }
  }

  const { resolveConfig } = await import('./configResolver');
  const { Handlers } = await import('./cli-handlers');

  // 参数解析逻辑优化
  let action: string | undefined;
  let configStr: string = '{}';
  let actionParam: string | undefined;

  if (isListModels) {
    action = '--list-models';
    configStr = args.find(a => a.startsWith('{')) || '{}';
  } else if (isInfo) {
    action = '--info';
    const idx = args.indexOf('--info');
    actionParam = args[idx + 1];
  } else if (isSearch) {
    action = '--search';
    const idx = args.indexOf('--search');
    actionParam = args[idx + 1];
  } else {
    // 默认为分析模式: [binary] [symbol] [config_json]
    const possibleJson = args.find(a => a.startsWith('{'));
    if (possibleJson) {
      configStr = possibleJson;
      const idx = args.indexOf(possibleJson);
      if (idx > 0) action = args[idx - 1];
    } else {
      action = args[args.length - 1];
    }
  }

  logger.info(`Sidecar 执行: action=${action}, param=${actionParam}, config_len=${configStr.length}`);

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
      await Handlers.handleInfo(actionParam || '');
      break;
    case '--search':
      await Handlers.handleSearch(actionParam || '');
      break;
    default:
      try {
        const config = resolveConfig(rawConfig);
        await Handlers.handleAnalysis(action || '', config);
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
