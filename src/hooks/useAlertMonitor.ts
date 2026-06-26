import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { fetchRealtimeQuote } from '../lib/ipc';
import type { PriceAlert } from './usePriceAlerts';
import type { RealtimeQuote } from '../../shared/types';

const POLL_MS = 10_000;

type FiredState = Record<string, { upper?: boolean; lower?: boolean }>;

async function sendNotification(title: string, body: string) {
  if (!isTauri()) {
    console.log(`[alert-mock] ${title}: ${body}`);
    return;
  }
  try {
    const { sendNotification: send } = await import('@tauri-apps/plugin-notification');
    send({ title, body });
  } catch (e) {
    console.error('发送通知失败:', e);
  }
}

export type QuoteFetcher = (symbol: string) => Promise<RealtimeQuote>;

export function useAlertMonitor(
  alerts: Record<string, PriceAlert>,
  fetcher: QuoteFetcher = fetchRealtimeQuote,
) {
  const firedRef = useRef<FiredState>({});

  useEffect(() => {
    const activeAlerts = Object.values(alerts).filter(
      (a) => a.enabled && (a.upperLimit != null || a.lowerLimit != null),
    );
    if (activeAlerts.length === 0) return;

    let active = true;

    async function check() {
      for (const alert of activeAlerts) {
        if (!active) return;
        try {
          const quote = await fetcher(alert.symbol);
          if (!active) return;
          const fired = firedRef.current[alert.symbol] ?? {};

          if (alert.upperLimit != null && quote.price >= alert.upperLimit) {
            if (!fired.upper) {
              fired.upper = true;
              sendNotification(
                'StockAI 价格提醒',
                `${alert.symbol} 突破上限 ${alert.upperLimit}，当前 ${quote.price.toFixed(2)}`,
              );
            }
          } else if (fired.upper) {
            fired.upper = false;
          }

          if (alert.lowerLimit != null && quote.price <= alert.lowerLimit) {
            if (!fired.lower) {
              fired.lower = true;
              sendNotification(
                'StockAI 价格提醒',
                `${alert.symbol} 跌破下限 ${alert.lowerLimit}，当前 ${quote.price.toFixed(2)}`,
              );
            }
          } else if (fired.lower) {
            fired.lower = false;
          }

          firedRef.current[alert.symbol] = fired;
        } catch {
          // 静默失败
        }
      }
    }

    check();
    const timer = setInterval(check, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [alerts, fetcher]);
}
