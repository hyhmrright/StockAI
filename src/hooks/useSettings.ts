import { useState, useEffect } from "react";
import { getStore } from "../lib/store";
import { ProviderType } from "../../shared/types";

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

export const PROVIDER_DEFAULTS: Record<ProviderType, ProviderConfig> = {
  openai:    { apiKey: "", baseUrl: "https://api.openai.com/v1",   model: "gpt-4o" },
  ollama:    { apiKey: "", baseUrl: "http://localhost:11434",       model: "qwen3.5:9b" },
  anthropic: { apiKey: "", baseUrl: "https://api.anthropic.com",   model: "claude-3-5-sonnet-20241022" },
  deepseek:  { apiKey: "", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
};

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: "ollama",
  providerConfigs: {
    ollama: { ...PROVIDER_DEFAULTS.ollama },
  },
  autoAnalyze: true,
  deepMode: true,
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
            // 注意：旧 saved.model 是模型名称，不是 provider 类型，不能用于迁移
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
