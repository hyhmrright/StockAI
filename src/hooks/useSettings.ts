import { useState, useEffect } from "react";
import { getStore } from "../lib/store";
import { ProviderType } from "../../shared/types";
import { PROVIDER_PROFILES, DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS, CONFIG_VERSION } from "../../shared/constants";

export type { ProviderType };

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  _version: string;
  activeProvider: ProviderType;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  autoAnalyze: boolean;
  deepMode: boolean;
}

// 重新导出常量以供 UI 组件使用
export { PROVIDER_PROFILES };

export const DEFAULT_SETTINGS: Settings = {
  _version: CONFIG_VERSION,
  ...SHARED_DEFAULT_SETTINGS,
  providerConfigs: {
    ollama: {
      apiKey: "",
      baseUrl: PROVIDER_PROFILES.ollama.baseUrl,
      model: PROVIDER_PROFILES.ollama.model,
    },
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await getStore();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saved = await store.get<any>("app_settings");

        if (saved) {
          // 执行深合并确保 providerConfigs 完整
          const mergedConfigs = { ...DEFAULT_SETTINGS.providerConfigs };
          if (saved.providerConfigs) {
            for (const [p, cfg] of Object.entries(saved.providerConfigs)) {
              const provider = p as ProviderType;
              mergedConfigs[provider] = {
                ...DEFAULT_SETTINGS.providerConfigs[provider],
                ...(cfg as any)
              };
            }
          }

          const migrated = { 
            ...DEFAULT_SETTINGS, 
            ...saved, 
            providerConfigs: mergedConfigs,
            _version: CONFIG_VERSION 
          };
          
          if (saved._version !== CONFIG_VERSION) {
            await store.set("app_settings", migrated);
            await store.save();
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

  async function updateSettings(newSettings: Partial<Settings>) {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);

      const store = await getStore();
      await store.set("app_settings", updated);
      await store.save();
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  }

  return { settings, updateSettings, isLoading };
}
