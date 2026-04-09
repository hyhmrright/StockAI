import React from "react";
import { Settings, PROVIDER_BASE_URLS } from "../../hooks/useSettings";
import { OpenAIForm } from "./OpenAIForm";
import { OllamaForm } from "./OllamaForm";

interface ProviderSelectorProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const PROVIDERS: Settings["provider"][] = ["openai", "ollama"];

/**
 * Provider 选择器 — 卡片切换 + 对应配置表单
 */
export function ProviderSelector({ settings, onChange }: ProviderSelectorProps): React.ReactElement {
  function handleProviderChange(provider: Settings["provider"]) {
    onChange({ provider, baseUrl: PROVIDER_BASE_URLS[provider] });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">选择服务提供商</label>
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => handleProviderChange(p)}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                settings.provider === p
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${settings.provider === p ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-gray-600"}`} />
              <span className="capitalize font-medium">{p}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 pt-4 border-t border-white/5">
        {settings.provider === "openai" ? (
          <OpenAIForm settings={settings} onChange={onChange} />
        ) : (
          <OllamaForm settings={settings} onChange={onChange} />
        )}
      </div>
    </div>
  );
}
