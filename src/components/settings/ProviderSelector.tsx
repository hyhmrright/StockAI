import React from "react";
import { Settings, ProviderType, PROVIDER_DEFAULTS } from "../../hooks/useSettings";
import { ProviderForm } from "./ProviderForm";

interface ProviderSelectorProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const PROVIDER_META: Record<ProviderType, { label: string; icon: string; description: string }> = {
  openai:    { label: "OpenAI",    icon: "🤖", description: "GPT-4o, GPT-4-turbo 等" },
  ollama:    { label: "Ollama",    icon: "🦙", description: "本地模型，qwen / llama 等" },
  anthropic: { label: "Anthropic", icon: "🔷", description: "Claude 3.5 Sonnet 等" },
  deepseek:  { label: "DeepSeek",  icon: "🐋", description: "DeepSeek Chat / Coder 等" },
};

const PROVIDERS = Object.keys(PROVIDER_META) as ProviderType[];

/**
 * 多 Provider 选择器
 * 顶部下拉框切换提供商，每个 Provider 的配置独立保存
 */
export function ProviderSelector({ settings, onChange }: ProviderSelectorProps): React.ReactElement {
  const active = settings.activeProvider ?? "ollama";
  const activeConfig = settings.providerConfigs?.[active] ?? PROVIDER_DEFAULTS[active];

  function handleProviderChange(provider: ProviderType) {
    // 切换时若该 Provider 尚未配置，注入默认值
    const existingConfig = settings.providerConfigs?.[provider];
    onChange({
      activeProvider: provider,
      providerConfigs: {
        ...settings.providerConfigs,
        [provider]: existingConfig ?? { ...PROVIDER_DEFAULTS[provider] },
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
          选择服务提供商
        </label>

        <div className="relative">
          <select
            value={active}
            onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
            className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
          >
            {PROVIDERS.map((p) => {
              const m = PROVIDER_META[p];
              return (
                <option key={p} value={p}>
                  {m.icon}  {m.label} — {m.description}
                </option>
              );
            })}
          </select>
          {/* 自定义下拉箭头 */}
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* 配置表单 */}
      <div className="pt-4 border-t border-white/5">
        <ProviderForm
          providerType={active}
          config={activeConfig}
          onChange={handleConfigChange}
        />
      </div>
    </div>
  );
}
