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
 * 搜索股票建议
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
    return items
      .map(item => {
        const fields = item.split(',');
        if (fields.length < 5) return null;

        const fullCodeFromSina = fields[0];
        const typeId = fields[1];
        const code = fields[2];
        const fullCodeFromSinaAlt = fields[3]; // 通常这个字段也包含带前缀的代码
        const name = fields[4];

        const typeInfo = TYPE_MAP[typeId] || { label: '其他', prefix: '' };
        
        // 构造统一的 fullCode
        // A 股优先使用带 sh/sz 前缀的代码（通常在 fields[0] 或 fields[3]）
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
      .filter((item): item is StockSearchResult => item !== null);
  } catch (err) {
    logger.error(`搜索股票失败: ${keyword} - ${err}`);
    return [];
  }
}
