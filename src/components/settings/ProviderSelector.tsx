import React from "react";
import { Settings, ProviderType, PROVIDER_PROFILES } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";
import type { TranslationKey } from "../../i18n";
import { ProviderForm } from "./ProviderForm";
import { RoleModelMatrix } from "./RoleModelMatrix";

/** 从 ProviderProfile 中仅取出表单字段（舍弃 contentLimit/timeout，它们是后端关心的内容） */
function defaultConfig(provider: ProviderType) {
  const { baseUrl, model } = PROVIDER_PROFILES[provider];
  return { baseUrl, model, apiKey: "" };
}

interface ProviderSelectorProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/** Provider 图标（emoji，专有展示，不走 i18n）；名称/描述走 i18n provider_name_* / provider_desc_* */
const PROVIDER_ICONS: Record<ProviderType, string> = {
  openai: "🤖",
  ollama: "🦙",
  anthropic: "🔷",
  deepseek: "🐋",
  glm: "🧠",
};

const PROVIDERS = Object.keys(PROVIDER_ICONS) as ProviderType[];

/**
 * 多 Provider 选择器
 * 顶部下拉框切换提供商，每个 Provider 的配置独立保存；下方为按角色分级模型矩阵。
 */
export function ProviderSelector({ settings, onChange }: ProviderSelectorProps): React.ReactElement {
  const { t } = useLanguage();
  const active = settings.activeProvider ?? "ollama";

  const activeConfig = settings.providerConfigs?.[active] ?? defaultConfig(active);

  function handleProviderChange(provider: ProviderType) {
    // 切换时若该 Provider 尚未配置，注入默认值
    const existingConfig = settings.providerConfigs?.[provider];
    onChange({
      activeProvider: provider,
      providerConfigs: {
        ...settings.providerConfigs,
        [provider]: existingConfig ?? defaultConfig(provider),
      },
    });
  }

  function handleConfigChange(patch: Partial<typeof activeConfig>) {
    onChange({
      providerConfigs: {
        ...settings.providerConfigs,
        [active]: { ...activeConfig, ...patch },
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Provider 下拉选择 */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          {t("select_provider")}
        </label>

        <div className="relative">
          <select
            value={active}
            onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
            className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_ICONS[p]}  {t(`provider_name_${p}` as TranslationKey)} — {t(`provider_desc_${p}` as TranslationKey)}
              </option>
            ))}
          </select>
          {/* 自定义下拉箭头 */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* 当前 Provider 配置表单 */}
      <div className="pt-4 border-t border-white/5">
        <ProviderForm
          providerType={active}
          config={activeConfig}
          onChange={handleConfigChange}
        />
      </div>

      {/* 按角色分级模型矩阵 */}
      <div className="pt-4 border-t border-white/5">
        <RoleModelMatrix settings={settings} onChange={onChange} />
      </div>
    </div>
  );
}
