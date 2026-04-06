import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";

/**
 * 设置项接口定义
 */
export interface Settings {
  apiKey: string;
  model: "openai" | "ollama";
  baseUrl: string;
  aiModel: string;
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "openai",
  baseUrl: "https://api.openai.com/v1",
  aiModel: "llama3",
};

const STORE_PATH = "settings.json";

/**
 * 设置持久化 Hook
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化加载设置
  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await load(STORE_PATH);
        const savedSettings = await store.get<Settings>("app_settings");
        
        if (savedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
        }
      } catch (error) {
        console.error("加载设置失败:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  /**
   * 更新并保存设置
   * @param newSettings 部分或全部新设置
   */
  const updateSettings = async (newSettings: Partial<Settings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);

      const store = await load(STORE_PATH);
      await store.set("app_settings", updated);
      await store.save(); // 显式保存到磁盘
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  };

  return {
    settings,
    updateSettings,
    isLoading,
  };
}
