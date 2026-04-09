import { useState, useEffect } from "react";
import { getStore } from "../lib/store";

/**
 * 设置项接口定义
 */
export interface Settings {
  apiKey: string;
  provider: "openai" | "ollama";
  baseUrl: string;
  aiModel: string;
  autoAnalyze: boolean;  // 点击关注列表时自动分析
  deepMode: boolean;     // 保留字段（当前抓取全文已默认开启）
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  aiModel: "",
  autoAnalyze: true,
  deepMode: true,
};

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
        const store = await getStore();
        const savedSettings = await store.get<Settings>("app_settings");
        
        if (savedSettings) {
          // 兼容旧版本：将 model 字段迁移为 provider
          const migrated = { ...DEFAULT_SETTINGS, ...savedSettings } as Settings & { model?: string };
          if (!savedSettings.provider && migrated.model) {
            migrated.provider = migrated.model as "openai" | "ollama";
            delete migrated.model;
            // 将迁移后的设置持久化，避免每次启动重复迁移
            const s = await getStore();
            await s.set("app_settings", migrated);
            await s.save();
          }
          setSettings(migrated);
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

      const store = await getStore();
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
