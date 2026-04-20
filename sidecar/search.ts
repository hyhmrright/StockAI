import type { StockSearchResult } from '../shared/types';
import { logger } from './utils';

/**
 * 股票类型映射表
 */
const TYPE_MAP: Record<string, { label: string; prefix: string }> = {
  '11': { label: 'A股', prefix: '' }, // A股代码通常在字段0中自带 sh/sz
  '12': { label: 'A股', prefix: '' },
  '31': { label: '港股', prefix: 'hk' },
  '41': { label: '美股', prefix: 'gb_' },
};

/**
 * 搜索股票建议并附带实时行情
 * @param keyword 关键词（代码或拼音/名称）
 */
export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  if (!keyword || keyword.length < 2) return [];

  // 新浪搜索建议接口，type=11,12(A股),31(港股),41(美股)
  const url = `https://suggest3.sinajs.cn/suggest/type=11,12,31,41&key=${encodeURIComponent(keyword)}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
      }
    });
    
    const buffer = await resp.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buffer);

    // 格式: var suggestvalue="sh601012,11,601012,sh601012,隆基绿能,,隆基绿能,99,1,ESG,,;..."
    const match = text.match(/"([^"]+)"/);
    if (!match || !match[1]) return [];

    const items = match[1].split(';');
    const results = items
      .map(item => {
        const fields = item.split(',');
        if (fields.length < 5) return null;

        const fullCodeFromSina = fields[0];
        const typeId = fields[1];
        const code = fields[2];
        const fullCodeFromSinaAlt = fields[3]; 
        const name = fields[4];

        const typeInfo = TYPE_MAP[typeId] || { label: '其他', prefix: '' };
        
        let fullCode = fullCodeFromSina;
        if ((typeId === '11' || typeId === '12') && !fullCode.match(/^(sh|sz|bj)/)) {
          fullCode = fullCodeFromSinaAlt;
        }

        if (typeId === '41' && !fullCode.startsWith('gb_')) {
          fullCode = `gb_${code}`;
        }

        return {
          name,
          code: code.toUpperCase(),
          type: typeInfo.label,
          fullCode: fullCode.toLowerCase(),
        };
      })
      .filter((item): item is StockSearchResult => item !== null)
      .slice(0, 8); // 限制返回数量，提高行情抓取效率

    // 批量抓取行情
    if (results.length > 0) {
      await enrichWithQuotes(results);
    }

    return results;
  } catch (err) {
    logger.error(`搜索股票失败: ${keyword} - ${err}`);
    return [];
  }
}

/**
 * 为搜索结果批量补充行情数据
 */
async function enrichWithQuotes(results: StockSearchResult[]): Promise<void> {
  // 构造新浪批量行情 URL (A股使用 s_ 前缀获取简易行情)
  const sinaCodes = results.map(r => {
    if (r.type === 'A股') return `s_${r.fullCode}`;
    return r.fullCode; // 美股/港股通常直接用 fullCode
  }).join(',');

  const url = `https://hq.sinajs.cn/list=${sinaCodes}`;

  try {
    const resp = await fetch(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn' }
    });
    const buffer = await resp.arrayBuffer();
    const text = new TextDecoder('gbk').decode(buffer);

    // 逐行解析行情
    const lines = text.split('\n');
    const quoteMap = new Map<string, Partial<StockSearchResult>>();

    lines.forEach(line => {
      // 匹配 var hq_str_s_sh601012="隆基绿能,18.52,-0.23,-1.23,..."
      const match = line.match(/var hq_str_(s_)?([^=]+)="([^"]+)"/);
      if (!match) return;

      const fullCode = match[2];
      const fields = match[3].split(',');
      
      if (fullCode.startsWith('gb_')) {
        // 美股完整行情解析
        if (fields.length >= 5) {
          quoteMap.set(fullCode, {
            price: parseFloat(fields[1]),
            changePercent: parseFloat(fields[2]),
            change: parseFloat(fields[4]),
          });
        }
      } else {
        // A股简易行情解析 (Name, Price, Change, ChangePercent, ...)
        if (fields.length >= 4) {
          quoteMap.set(fullCode, {
            price: parseFloat(fields[1]),
            change: parseFloat(fields[2]),
            changePercent: parseFloat(fields[3]),
          });
        }
      }
    });

    // 合并行情到结果中
    results.forEach(r => {
      const quote = quoteMap.get(r.fullCode);
      if (quote) {
        r.price = quote.price;
        r.change = quote.change;
        r.changePercent = quote.changePercent;
      }
    });
  } catch (err) {
    logger.warn(`批量抓取行情失败: ${err}`);
  }
}
