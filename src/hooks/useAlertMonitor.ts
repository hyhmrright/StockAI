import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { fetchRealtimeQuote } from '../lib/ipc';
import type { PriceAlert } from './usePriceAlerts';
import { useLanguage } from './useLanguage';
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
  const { t } = useLanguage();

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
                t('alert_notify_title'),
                t('alert_notify_above', {
                  symbol: alert.symbol,
                  limit: alert.upperLimit,
                  price: quote.price.toFixed(2),
                }),
              );
            }
          } else if (fired.upper) {
            fired.upper = false;
          }

          if (alert.lowerLimit != null && quote.price <= alert.lowerLimit) {
            if (!fired.lower) {
              fired.lower = true;
              sendNotification(
                t('alert_notify_title'),
                t('alert_notify_below', {
                  symbol: alert.symbol,
                  limit: alert.lowerLimit,
                  price: quote.price.toFixed(2),
                }),
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
  }, [alerts, fetcher, t]);
}
