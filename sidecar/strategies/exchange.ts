/**
 * A 股交易所代码检测工具
 * 从 symbol（可为 "601012"、"隆基绿能601012" 等格式）中提取 6 位数字代码
 * 并根据首位数字推断交易所
 */
export interface ChinaStockInfo {
  code: string;
  googleSuffix: string; // Google Finance 后缀，如 "SHA"
  yahooSuffix: string;  // Yahoo Finance 后缀，如 ".SS"
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
    return { code, googleSuffix: 'SHA', yahooSuffix: '.SS' }; // 上交所
  }
  if (first === '0' || first === '3') {
    return { code, googleSuffix: 'SZE', yahooSuffix: '.SZ' }; // 深交所
  }
  if (first === '4' || first === '8') {
    return { code, googleSuffix: 'BJS', yahooSuffix: '.BJ' }; // 北交所
  }

  return null;
}
