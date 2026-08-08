import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { PriceAlert } from './usePriceAlerts';
import { useLanguage } from './useLanguage';
import type { RealtimeQuote } from '../../shared/types';

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

/**
 * 价格告警：对已有报价的纯反应，**自己不取数**。
 *
 * 原先它持有一套独立的 10s 轮询，且逐个标的串行取价——sidecar 是 spawn-per-call，
 * 5 条告警就是每 10 秒 5 个进程，而且不看交易时段、通宵不停。取数改由调用方的
 * useQuotes 统一负责（一次进程拉完、只在交易时段轮询），这里只管「越界了没有」。
 *
 * 边沿触发：越界只在**首次**越界时通知一次，价格回到区间内才重新武装。
 * 否则一根横在上限之上的价格会每个轮询周期弹一次通知。
 */
export function useAlertMonitor(
  alerts: Record<string, PriceAlert>,
  quotes: Record<string, RealtimeQuote>,
) {
  const firedRef = useRef<FiredState>({});
  const { t } = useLanguage();

  useEffect(() => {
    for (const alert of Object.values(alerts)) {
      if (!alert.enabled) continue;
      const quote = quotes[alert.symbol];
      if (!quote) continue;

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
    }
  }, [alerts, quotes, t]);
}
