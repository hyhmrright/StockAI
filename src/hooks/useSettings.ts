import { useState, useEffect } from "react";
import { getStore } from "../lib/store";
import { ProviderType, Language, Role, ModelChoice, RoleModels } from "../../shared/types";
import { PROVIDER_PROFILES, DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS, CONFIG_VERSION, DEFAULT_SELECTED_MASTERS } from "../../shared/constants";

export type { ProviderType, Language, Role, ModelChoice, RoleModels };

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  _version: string;
  activeProvider: ProviderType;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  /** 按角色分级模型；空对象 = 所有角色跟随 activeProvider（默认） */
  roleModels: RoleModels;
  autoAnalyze: boolean;
  deepMode: boolean;
  masterAnalysis: boolean;
  selectedMasters: string[];
  language: Language;
}

// 重新导出常量以供 UI 组件使用
export { PROVIDER_PROFILES };

export const DEFAULT_SETTINGS: Settings = {
  _version: CONFIG_VERSION,
  ...SHARED_DEFAULT_SETTINGS,
  masterAnalysis: false,
  selectedMasters: DEFAULT_SELECTED_MASTERS,
  // 默认空 = 所有角色跟随 activeProvider；用户在角色矩阵里按需 opt-in 分级
  roleModels: {},
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
        const saved = await store.get<Partial<Settings>>("app_settings");

        if (saved) {
          // 执行深合并确保 providerConfigs 完整
          const mergedConfigs = { ...DEFAULT_SETTINGS.providerConfigs };
          if (saved.providerConfigs) {
            for (const [p, cfg] of Object.entries(saved.providerConfigs)) {
              const provider = p as ProviderType;
              mergedConfigs[provider] = {
                ...DEFAULT_SETTINGS.providerConfigs[provider],
                ...cfg,
              };
            }
          }

          const migrated = {
            ...DEFAULT_SETTINGS,
            ...saved,
            providerConfigs: mergedConfigs,
            // roleModels 增量补默认：旧配置无此字段时为空对象（全部跟随 active），有则原样保留
            roleModels: { ...DEFAULT_SETTINGS.roleModels, ...(saved.roleModels ?? {}) },
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
