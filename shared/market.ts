import type { Market } from './types';

/**
 * 从原始 symbol 判断市场归属（跨层共享，前端 + Sidecar 唯一来源）
 * 规则：含 6 位数字 → A 股；其它（含字母、gb_ 前缀）→ 美股
 */
export function detectMarket(symbol: string): Market {
  return /(?<!\d)\d{6}(?!\d)/.test(symbol) ? 'A股' : '美股';
}
