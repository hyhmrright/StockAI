import { detectMarket } from '../../shared/market';
import type { KlinePoint, MasterSignalRecord } from '../../shared/types';
import { fetchKline } from './ipc';
/** 同一批历史加载供榜单、动态权重与模拟组合共用，限制上游并发并短时去重。 */
const cache = new Map<string, { at: number; promise: Promise<KlinePoint[]> }>();
export async function loadMasterHistory(
  signals: MasterSignalRecord[],
): Promise<Record<string, KlinePoint[]>> {
  const result: Record<string, KlinePoint[]> = {};
  const symbols = [
    ...new Set([
      ...signals.map((s) => s.symbol),
      ...signals.map((s) => (detectMarket(s.symbol) === 'A股' ? 'sh000300' : '^GSPC')),
    ]),
  ];
  for (let i = 0; i < symbols.length; i += 4)
    await Promise.all(
      symbols.slice(i, i + 4).map(async (symbol) => {
        let entry = cache.get(symbol);
        if (!entry || Date.now() - entry.at > 300000) {
          entry = { at: Date.now(), promise: fetchKline({ symbol, period: '1d', range: 'all' }) };
          cache.set(symbol, entry);
          entry.promise.catch(() => cache.delete(symbol));
        }
        result[symbol] = await entry.promise.catch(() => []);
      }),
    );
  if (cache.size > 200)
    for (const [key, entry] of cache) if (Date.now() - entry.at > 300000) cache.delete(key);
  return result;
}
