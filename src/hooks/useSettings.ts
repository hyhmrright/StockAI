import { useState, useEffect } from "react";
import { getStore } from "../lib/store";
import { ProviderType } from "../../shared/types";
import { PROVIDER_DEFAULTS, DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS } from "../../shared/constants";

export type { ProviderType };

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  activeProvider: ProviderType;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  autoAnalyze: boolean;
  deepMode: boolean;
}

// 重新导出常量以供 UI 组件使用
export { PROVIDER_DEFAULTS };

export const DEFAULT_SETTINGS: Settings = {
  ...SHARED_DEFAULT_SETTINGS,
  providerConfigs: {
    ollama: { 
      apiKey: "", 
      baseUrl: PROVIDER_DEFAULTS.ollama.baseUrl, 
      model: PROVIDER_DEFAULTS.ollama.model 
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
          if (saved.activeProvider) {
            // 已是新格式，直接合并
            setSettings({ ...DEFAULT_SETTINGS, ...saved });
          } else {
            // 迁移旧格式（v0.1.x 扁平结构）
            const oldProvider: ProviderType = (saved.provider ?? "openai") as ProviderType;
            const migrated: Settings = {
              ...DEFAULT_SETTINGS,
              activeProvider: oldProvider,
              autoAnalyze: saved.autoAnalyze ?? true,
              deepMode: saved.deepMode ?? true,
              providerConfigs: {
                [oldProvider]: {
                  apiKey: saved.apiKey ?? "",
                  baseUrl: saved.baseUrl ?? PROVIDER_DEFAULTS[oldProvider].baseUrl,
                  model: saved.aiModel ?? PROVIDER_DEFAULTS[oldProvider].model,
                },
              },
            };
            await store.set("app_settings", migrated);
            await store.save();
            setSettings(migrated);
          }
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
