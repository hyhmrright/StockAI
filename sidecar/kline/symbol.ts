/**
 * A 股代码解析：从原始 symbol 中识别交易所前缀（sh/sz/bj）和 6 位代码。
 * 多个数据源（tencent / eastmoney）都需要这套规则，抽出避免后续漂移。
 */
export type ChinaExchangePrefix = 'sh' | 'sz' | 'bj';

export interface ChinaSymbol {
  prefix: ChinaExchangePrefix;
  code: string;
}

/**
 * 解析 A 股 symbol。规则：
 * - 优先采纳显式前缀（如 "sh600519" → sh）
 * - 缺前缀则按首位推断：6→sh，0/3→sz，4/8→bj
 * - 其他首位兜底 sh（罕见，保持 tencent 历史行为）
 */
export function parseChinaSymbol(raw: string): ChinaSymbol {
  const m = raw.match(/(sh|sz|bj)?(\d{6})/i);
  if (!m) throw new Error(`无法解析 A 股代码：${raw}`);
  const code = m[2];
  const explicit = m[1]?.toLowerCase() as ChinaExchangePrefix | undefined;
  if (explicit) return { prefix: explicit, code };
  if (code.startsWith('6')) return { prefix: 'sh', code };
  if (code.startsWith('0') || code.startsWith('3')) return { prefix: 'sz', code };
  if (code.startsWith('4') || code.startsWith('8')) return { prefix: 'bj', code };
  return { prefix: 'sh', code };
}

/**
 * 东财 secid 市场码：sh=1，其它（sz/bj/创业板）=0
 */
export function chinaPrefixToEastmoneyMarket(prefix: ChinaExchangePrefix): 0 | 1 {
  return prefix === 'sh' ? 1 : 0;
}

/**
 * 美股指数在各家源的代码互不相同：Yahoo 是 ^GSPC，腾讯是 usINX，新浪是 gb_$inx。
 * 这里只登记「Yahoo 代码 → 各源共用的裸 id」，`us` / `gb_$` 之类的前缀由各源自己拼——
 * 否则这张表就得按源数量翻倍。前端 IndexBar 用的是 Yahoo 写法，故以它为 key。
 */
const US_INDEX_IDS: Record<string, string> = {
  '^GSPC': 'INX',
  '^IXIC': 'IXIC',
  '^DJI': 'DJI',
};

export interface UsSymbol {
  /** 裸代码：个股为大写 ticker（AAPL），指数为各源通用 id（INX / IXIC / DJI） */
  ticker: string;
  isIndex: boolean;
}

/** 解析美股 symbol：剥掉 gb_ 前缀，指数换成通用 id，其余一律大写 */
export function parseUsSymbol(raw: string): UsSymbol {
  const cleaned = raw.replace(/^gb_/i, '').trim().toUpperCase();
  const indexId = US_INDEX_IDS[cleaned];
  return indexId ? { ticker: indexId, isIndex: true } : { ticker: cleaned, isIndex: false };
}
