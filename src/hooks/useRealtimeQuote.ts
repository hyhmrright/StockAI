import { useEffect, useState } from "react";
import { fetchRealtimeQuote } from "../lib/ipc";
import { detectMarket, isTradingHours } from "../lib/market-hours";
import type { RealtimeQuote } from "../../shared/types";

const POLL_MS = 10_000;

/**
 * 实时报价 hook
 * - 切换 symbol 立即拉一次
 * - 仅在交易时段每 10 秒轮询
 * - 失败时静默保留最后一次成功的报价
 */
export function useRealtimeQuote(symbol: string): RealtimeQuote | null {
  const [quote, setQuote] = useState<RealtimeQuote | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const market = detectMarket(symbol);

    const tick = async () => {
      try {
        const q = await fetchRealtimeQuote(symbol);
        if (active) setQuote(q);
      } catch {
        // 静默失败 — 保留最后一次成功的报价
      }
    };

    // 切换股票时立即拉一次
    tick();

    // 仅在交易时段启用轮询
    if (isTradingHours(market)) {
      timer = setInterval(tick, POLL_MS);
    }

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [symbol]);

  return quote;
}
