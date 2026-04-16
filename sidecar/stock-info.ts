import type { StockInfo } from '../shared/types';
import type { ParsedSymbol } from './parsers/exchange';
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
 * 从新浪财经实时行情接口获取 A 股基本信息
 * 格式：var hq_str_sh688693="锴威特,20.44,20.32,...";
 * 字段 0=名称, 1=今开, 2=昨收, 3=当前价, ...
 */
export async function fetchStockInfo(parsed: ParsedSymbol): Promise<StockInfo | null> {
  if (!parsed.chinaInfo) return null;

  const { code, sinaPrefix } = parsed.chinaInfo;
  const url = `https://hq.sinajs.cn/list=${sinaPrefix}${code}`;

  try {
    const resp = await fetch(url, {
      headers: {
        // 新浪需要 Referer 才能返回数据，否则返回空串
        Referer: 'https://finance.sina.com.cn',
      },
    });
    // 新浪行情接口返回 GBK 编码，需手动解码（默认 UTF-8 会产生乱码）
    const buffer = await resp.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buffer);

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
    console.error(`fetchStockInfo 失败 (${code}):`, toErrorMessage(err));
    return null;
  }
}
