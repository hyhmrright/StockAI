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
        outputJson({ data: { models: list.models.map(m => m.name) } });
      } else {
        outputJson({ data: { models: DEFAULT_OPENAI_MODELS } });
      }
    } catch (error) {
      outputJson({ 
        error: { 
          code: 'ERR_LIST_MODELS', 
          message: toErrorMessage(error) 
        } 
      });
    }
    return;
  }

  // 支持仅获取股票信息动作
  if (symbolOrAction === '--info') {
    const symbol = process.argv[4]; // 格式: backend --info <config> <symbol>
    if (!symbol) {
      outputJson({ error: "未提供股票代码" });
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
        outputJson({ error: `未找到股票 "${symbol}" 的信息` });
      }
    } catch (error) {
      outputJson({ error: toErrorMessage(error) });
    }
    return;
  }

  // 支持搜索股票建议
  if (symbolOrAction === '--search') {
    const keyword = process.argv[4]; // 格式: backend --search <config> <keyword>
    if (!keyword) {
      outputJson({ data: [] });
      return;
    }
    try {
      const { searchStocks } = await import('./search');
      const results = await searchStocks(keyword);
      outputJson({ data: results });
    } catch (error) {
      outputJson({ error: toErrorMessage(error) });
    }
    return;
  }

  try {
    // 执行完整分析
    const result = await performFullAnalysis(symbolOrAction, config.provider, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.modelName,
      deepMode: config.deepMode,
    });

    outputJson({ data: result });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error("Sidecar 运行出错: " + errorMessage);
    outputJson({ 
      error: { 
        code: errorMessage.includes('未搜寻到') ? 'ERR_SCRAPE_EMPTY' : 'ERR_ANALYSIS_FAILED',
        message: errorMessage 
      } 
    });
  }
}

main().catch(err => {
  const errorMessage = toErrorMessage(err);
  logger.error("致命错误: " + errorMessage);
  outputJson({ error: `内部错误: ${errorMessage}` });
});
