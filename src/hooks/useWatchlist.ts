import { useState, useEffect, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";

export interface WatchlistItem {
  sym: string;
  name: string;
}

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { sym: "AAPL", name: "Apple Inc." },
  { sym: "TSLA", name: "Tesla, Inc." },
  { sym: "NVDA", name: "NVIDIA Corp." },
  { sym: "MSFT", name: "Microsoft Corp." },
];

const STORE_PATH = "settings.json";
const STORE_KEY = "watchlist";

/**
 * 关注列表持久化 Hook
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST);
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  async function getStore() {
    if (!storeRef.current) {
      storeRef.current = await load(STORE_PATH);
    }
    return storeRef.current;
  }

  useEffect(() => {
    async function init() {
      try {
        const store = await getStore();
        const saved = await store.get<WatchlistItem[]>(STORE_KEY);
        if (saved && saved.length > 0) setItems(saved);
      } catch (e) {
        console.error("加载关注列表失败:", e);
      }
    }
    init();
  }, []);

  async function save(next: WatchlistItem[]) {
    setItems(next);
    try {
      const store = await getStore();
      await store.set(STORE_KEY, next);
      await store.save();
    } catch (e) {
      console.error("保存关注列表失败:", e);
    }
  }

  function add(sym: string) {
    const normalized = sym.trim().toUpperCase();
    if (!normalized || items.some(i => i.sym === normalized)) return;
    save([...items, { sym: normalized, name: normalized }]);
  }

  function remove(sym: string) {
    save(items.filter(i => i.sym !== sym));
  }

  return { items, add, remove };
}
