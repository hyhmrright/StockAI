import { useEffect, useState } from 'react';
import { fetchRealtimeQuote } from '../lib/ipc';
import { detectMarket, isTradingHours } from '../lib/market-hours';
import type { RealtimeQuote } from '../../shared/types';

const POLL_MS = 10_000;

/**
 * 实时报价 hook
 * - 切换 symbol 立即拉一次（无论是否开盘，给出"最后已知价格"）
 * - 周期性 tick 时再判断交易时段：开盘期间真正拉数据，否则空转
 *   这样长时间打开应用、跨越 open→close 边界也不会持续刷接口
 * - 失败时静默保留最后一次成功的报价
 */
export function useRealtimeQuote(symbol: string): RealtimeQuote | null {
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);

  useEffect(() => {
    let active = true;
    const market = detectMarket(symbol);

    const fetchOnce = async () => {
      try {
        const q = await fetchRealtimeQuote(symbol);
        if (active) setQuote(q);
      } catch {
        // 静默失败 — 保留最后一次成功的报价
      }
    };

    const tick = () => {
      if (!isTradingHours(market)) return;
      void fetchOnce();
    };

    // 切换股票时立即拉一次（不受交易时段限制）
    void fetchOnce();
    const timer = setInterval(tick, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [symbol]);

  return quote;
}
