import { useState, useEffect, useCallback } from 'react';
import { getStore } from '../lib/store';

export interface PriceAlert {
  symbol: string;
  upperLimit?: number;
  lowerLimit?: number;
  enabled: boolean;
}

const STORE_KEY = 'price_alerts';

export function usePriceAlerts() {
  const [alerts, setAlerts] = useState<Record<string, PriceAlert>>({});

  useEffect(() => {
    async function init() {
      try {
        const store = await getStore();
        const saved = await store.get<Record<string, PriceAlert>>(STORE_KEY);
        if (saved) setAlerts(saved);
      } catch (e) {
        console.error('加载价格提醒失败:', e);
      }
    }
    init();
  }, []);

  async function persist(next: Record<string, PriceAlert>) {
    setAlerts(next);
    try {
      const store = await getStore();
      await store.set(STORE_KEY, next);
      await store.save();
    } catch (e) {
      console.error('保存价格提醒失败:', e);
    }
  }

  const setAlert = useCallback((symbol: string, upperLimit?: number, lowerLimit?: number) => {
    setAlerts((prev) => {
      const next = {
        ...prev,
        [symbol]: { symbol, upperLimit, lowerLimit, enabled: true },
      };
      persist(next);
      return next;
    });
  }, []);

  const removeAlert = useCallback((symbol: string) => {
    setAlerts((prev) => {
      const next = { ...prev };
      delete next[symbol];
      persist(next);
      return next;
    });
  }, []);

  const toggleAlert = useCallback((symbol: string) => {
    setAlerts((prev) => {
      if (!prev[symbol]) return prev;
      const next = {
        ...prev,
        [symbol]: { ...prev[symbol], enabled: !prev[symbol].enabled },
      };
      persist(next);
      return next;
    });
  }, []);

  return { alerts, setAlert, removeAlert, toggleAlert };
}
