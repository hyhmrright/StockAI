import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "settings.json";

// 缓存 store 实例的 Promise，确保全局只加载一次
let storePromise: ReturnType<typeof load> | null = null;

/**
 * 获取全局唯一的 Store 实例
 * 所有 Hook 通过此函数共享同一个 store，避免写冲突
 */
export function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_PATH);
  }
  return storePromise;
}
