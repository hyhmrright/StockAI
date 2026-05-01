import type { StockInfo } from '../shared/types';
import { type ParsedSymbol, parseSymbol } from './parsers/exchange';
import { searchStocks } from './search';
import { toErrorMessage } from './utils';

// 代码前缀 → 交易所名称
const EXCHANGE_NAME: Record<string, string> = {
  sh: '上交所',
  sz: '深交所',
  bj: '北交所',
};

export function resolveExchangeName(prefix: string, code: string): string {
  if (prefix === 'sh' && code.startsWith('688')) return '科创板';
  if (prefix === 'sz' && (code.startsWith('300') || code.startsWith('301'))) return '创业板';
  return EXCHANGE_NAME[prefix] ?? prefix.toUpperCase();
}

/**
 * 从新浪财经实时行情接口获取基本信息
 */
export async function fetchStockInfo(parsed: ParsedSymbol): Promise<StockInfo | null> {
  if (parsed.chinaInfo) {
    return fetchChinaStockInfo(parsed);
  } else if (parsed.usInfo) {
    return fetchUSStockInfo(parsed);
  }

  // 智能搜索回退：如果输入无法解析为标准代码，尝试通过名称搜索
  const results = await searchStocks(parsed.rawInput);
  if (results.length > 0) {
    const bestMatch = results[0];
    const newParsed = parseSymbol(bestMatch.fullCode || bestMatch.code);
    if (newParsed.chinaInfo || newParsed.usInfo) {
      return fetchStockInfo(newParsed);
    }
  }

  return null;
}

/**
 * 从新浪财经实时行情接口获取 A 股基本信息
 */
async function fetchChinaStockInfo(parsed: ParsedSymbol): Promise<StockInfo | null> {
  const { code, sinaPrefix } = parsed.chinaInfo!;
  const url = `https://hq.sinajs.cn/list=${sinaPrefix}${code}`;

  try {
    const text = await fetchWithSinaReferer(url);
    if (!text) return null;

    // 响应格式: var hq_str_sh688693="字段1,字段2,...";
    const match = text.match(/"([^"]+)"/);
    if (!match || !match[1]) return null;

    const fields = match[1].split(',');
    if (fields.length < 4) return null;

    const name = fields[0];
    const prevClose = parseFloat(fields[2]);
    const price = parseFloat(fields[3]);

    if (!name || isNaN(price) || price === 0) return null;

    const change = parseFloat((price - prevClose).toFixed(3));
    const changePercent = parseFloat(((change / prevClose) * 100).toFixed(2));

    return {
      name,
      code,
      exchange: resolveExchangeName(sinaPrefix, code),
      market: 'A股',
      price,
      change,
      changePercent,
      currency: 'CNY',
    };
  } catch (err) {
    console.error(`fetchChinaStockInfo 失败 (${code}):`, toErrorMessage(err));
    return null;
  }
}

/**
 * 从新浪财经实时行情接口获取美股基本信息
 */
async function fetchUSStockInfo(parsed: ParsedSymbol): Promise<StockInfo | null> {
  const { symbol, sinaPrefix } = parsed.usInfo!;
  const url = `https://hq.sinajs.cn/list=${sinaPrefix}${symbol.toLowerCase()}`;

  try {
    const text = await fetchWithSinaReferer(url);
    if (!text) return null;

    // 响应格式: var hq_str_gb_aapl="名称,当前价,涨跌百分比,时间,涨跌额,开盘价,最高价,最低价,...,昨收";
    const match = text.match(/"([^"]+)"/);
    if (!match || !match[1]) return null;

    const fields = match[1].split(',');
    if (fields.length < 27) return null;

    const name = fields[0];
    const price = parseFloat(fields[1]);
    const changePercent = parseFloat(fields[2]);
    const change = parseFloat(fields[4]);

    if (!name || isNaN(price) || price === 0) return null;

    return {
      name,
      code: symbol,
      exchange: 'NASDAQ/NYSE',
      market: '美股',
      price,
      change,
      changePercent,
      currency: 'USD',
    };
  } catch (err) {
    console.error(`fetchUSStockInfo 失败 (${symbol}):`, toErrorMessage(err));
    return null;
  }
}

/**
 * 带 Referer 的请求辅助函数，处理 GBK 解码
 */
async function fetchWithSinaReferer(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn',
      },
    });
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return null;
  }
}
