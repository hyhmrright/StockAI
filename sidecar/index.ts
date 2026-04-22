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
  const rawConfigStr = process.argv[3] || '{}';

  // 调试日志函数
  const debugLog = (msg: string) => {
    try {
      const fs = require('fs');
      fs.appendFileSync('/tmp/stockai-sidecar.log', `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {}
  };

  debugLog(`Action: ${symbolOrAction}`);
  try {
    const redacted = { ...JSON.parse(rawConfigStr), apiKey: '[REDACTED]' };
    debugLog(`Config: ${JSON.stringify(redacted)}`);
  } catch { debugLog('Config: [parse failed]'); }

  if (!symbolOrAction) {
    debugLog("错误: 未提供 Action");
    logger.error("使用方法: stockai-backend <SYMBOL|ACTION> <configJSON>");
    process.exit(1);
  }

  // 解析 JSON 配置（第二个参数）
  let rawConfig: any;
  try {
    rawConfig = JSON.parse(rawConfigStr);
  } catch {
    logger.error("配置 JSON 解析失败: " + rawConfigStr);
    rawConfig = {};
  }

  // 支持获取模型列表动作
  if (symbolOrAction === '--list-models') {
    debugLog(`处理 --list-models 开始`);
    try {
      const provider = rawConfig.provider || 'ollama';
      const baseUrl = rawConfig.baseUrl || rawConfig.base_url || '';
      debugLog(`Provider: ${provider}, BaseURL: ${baseUrl}`);

      if (provider === 'ollama') {
        debugLog(`尝试连接 Ollama...`);
        const ollama = new Ollama({ host: baseUrl });
        const list = await ollama.list();
        debugLog(`获取成功，模型数量: ${list.models.length}`);
        outputJson({ data: { models: list.models.map(m => m.name) } });
        process.exit(0);
      } else {
        debugLog(`返回默认 OpenAI 模型`);
        outputJson({ data: { models: DEFAULT_OPENAI_MODELS } });
        process.exit(0);
      }
    } catch (error) {
      const errMsg = toErrorMessage(error);
      debugLog(`异常: ${errMsg}`);
      outputJson({ 
        error: { 
          code: 'ERR_LIST_MODELS', 
          message: errMsg
        } 
      });
      process.exit(0);
    }
    return;
  }

  // 支持仅获取股票信息动作
  if (symbolOrAction === '--info') {
    const symbol = process.argv[4]; // 格式: backend --info <config> <symbol>
    if (!symbol) {
      outputJson({ error: { code: 'ERR_MISSING_PARAM', message: '未提供股票代码' } });
      process.exit(0);
      return;
    }
    try {
      const { parseSymbol } = await import('./parsers/exchange');
      const { fetchStockInfo } = await import('./stock-info');
      const parsed = parseSymbol(symbol);
      const info = await fetchStockInfo(parsed);
      if (info) {
        outputJson({ data: info });
      } else {
        outputJson({ error: { code: 'ERR_NOT_FOUND', message: `未找到股票 "${symbol}" 的信息` } });
      }
      process.exit(0);
    } catch (error) {
      outputJson({ error: { code: 'ERR_INFO', message: toErrorMessage(error) } });
      process.exit(0);
    }
    return;
  }

  // 支持搜索股票建议
  if (symbolOrAction === '--search') {
    const keyword = process.argv[4]; // 格式: backend --search <config> <keyword>
    if (!keyword) {
      outputJson({ data: [] });
      process.exit(0);
      return;
    }
    try {
      const { searchStocks } = await import('./search');
      const results = await searchStocks(keyword);
      outputJson({ data: results });
      process.exit(0);
    } catch (error) {
      outputJson({ error: { code: 'ERR_SEARCH', message: toErrorMessage(error) } });
      process.exit(0);
    }
    return;
  }

  // 解析配置，版本不兼容时直接返回错误（仅针对完整分析流程）
  let config;
  try {
    debugLog(`正在解析配置: ${rawConfigStr}`);
    config = resolveConfig(rawConfig);
    debugLog(`配置解析成功: provider=${config.provider}, model=${config.modelName}`);
  } catch (error) {
    const errMsg = toErrorMessage(error);
    debugLog(`配置解析失败: ${errMsg}`);
    outputJson({ error: { code: 'ERR_CONFIG', message: errMsg } });
    return;
  }

  try {
    debugLog(`开始执行完整分析: symbol=${symbolOrAction}`);
    // 执行完整分析
    const result = await performFullAnalysis(symbolOrAction, config.provider, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.modelName,
      deepMode: config.deepMode,
    });

    debugLog(`分析执行成功`);
    outputJson({ data: result });
    process.exit(0);
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    debugLog(`分析执行失败: ${errorMessage}`);
    logger.error("Sidecar 运行出错: " + errorMessage);
    outputJson({ 
      error: { 
        code: errorMessage.includes('未搜寻到') ? 'ERR_SCRAPE_EMPTY' : 'ERR_ANALYSIS_FAILED',
        message: errorMessage 
      } 
    });
    process.exit(0);
  }
}

main().catch(err => {
  const errorMessage = toErrorMessage(err);
  logger.error("致命错误: " + errorMessage);
  outputJson({ error: { code: 'ERR_FATAL', message: `内部错误: ${errorMessage}` } });
});
