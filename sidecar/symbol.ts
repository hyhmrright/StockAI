import { parseSymbol } from './parsers/exchange';
import { fetchStockInfo } from './stock-info';

/**
 * 获取增强后的搜索关键词。
 * 对于 A 股纯代码输入，尝试获取其公司名以提升新闻命中率（例如："601012" -> "隆基绿能601012"）。
 * 获取失败时静默回退到原始输入——这是搜索优化而非强依赖。
 */
export async function getEnhancedSymbol(symbol: string): Promise<string> {
  const parsed = parseSymbol(symbol);

  if (parsed.chinaInfo && !parsed.displayName) {
    try {
      const info = await fetchStockInfo(parsed);
      if (info?.name) return `${info.name}${parsed.chinaInfo.code}`;
    } catch {
      // 忽略获取失败，回退到原始输入
    }
  }

  return symbol;
}
