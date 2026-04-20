/**
 * A 股交易所代码检测工具
 * 从 symbol（可为 "601012"、"隆基绿能601012" 等格式）中提取 6 位数字代码
 * 并根据首位数字推断交易所
 */
export interface ChinaStockInfo {
  code: string;
  googleSuffix: string; // Google Finance 后缀，如 "SHA"
  yahooSuffix: string;  // Yahoo Finance 后缀，如 ".SS"
  sinaPrefix: string;   // 新浪财经接口前缀，如 "sh"
}

/**
 * 美股信息
 */
export interface USStockInfo {
  symbol: string;       // 如 "AAPL"
  sinaPrefix: string;   // 新浪财经接口前缀 "gb_"
}

/**
 * 解析后的输入结构，支持中文名+代码混合输入（如 "锴威特688693"）
 */
export interface ParsedSymbol {
  rawInput: string;
  displayName?: string;    // 从输入中提取的中文名（如 "锴威特"）
  chinaInfo?: ChinaStockInfo;
  usInfo?: USStockInfo;
}

/**
 * 解析用户输入，提取股票名称与股票代码
 * 支持格式：纯代码 "688693"、纯名称 "AAPL"、混合 "锴威特688693"
 */
export function parseSymbol(input: string): ParsedSymbol {
  const trimmed = input.trim();
  
  // 1. 尝试识别 A 股
  const chinaInfo = detectChinaStock(trimmed);
  if (chinaInfo) {
    // 提取 6 位代码前后的非数字文本作为显示名称
    const nameCandidate = trimmed.replace(/\d{6}/, '').trim();
    return {
      rawInput: trimmed,
      displayName: nameCandidate || undefined,
      chinaInfo,
    };
  }

  // 2. 尝试识别美股（通常为纯字母，2-5位）
  // 注意：此处简化处理，非 A 股且不含非法字符的即尝试作为美股处理
  const usMatch = trimmed.match(/^[A-Za-z]+$/);
  if (usMatch) {
    const symbol = trimmed.toUpperCase();
    return {
      rawInput: trimmed,
      usInfo: {
        symbol,
        sinaPrefix: 'gb_',
      }
    };
  }

  return { rawInput: trimmed };
}

/**
 * 尝试从 symbol 中识别 A 股代码，返回交易所信息
 * 返回 null 表示非 A 股，应按美股处理
 */
export function detectChinaStock(symbol: string): ChinaStockInfo | null {
  const match = symbol.match(/\d{6}/);
  if (!match) return null;

  const code = match[0];
  const first = code[0];

  if (first === '6') {
    return { code, googleSuffix: 'SHA', yahooSuffix: '.SS', sinaPrefix: 'sh' };
  }
  if (first === '0' || first === '3') {
    return { code, googleSuffix: 'SZE', yahooSuffix: '.SZ', sinaPrefix: 'sz' };
  }
  if (first === '4' || first === '8') {
    return { code, googleSuffix: 'BJS', yahooSuffix: '.BJ', sinaPrefix: 'bj' };
  }

  return null;
}
