import React from "react";
import { Settings } from "../../hooks/useSettings";
import type { Language } from "../../hooks/useLanguage";
import { UpdateChecker } from "./UpdateChecker";

interface GeneralFormProps {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
}

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative transition-colors ${
        enabled ? "bg-emerald-500/30" : "bg-gray-800"
      }`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-all ${
        enabled ? "right-0.5 bg-emerald-400" : "left-0.5 bg-gray-500"
      }`} />
    </button>
  );
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export const GeneralForm: React.FC<GeneralFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">切换股票时自动 AI 分析</span>
          <span className="setting-desc text-gray-500 text-xs">开启后每次切换股票都会自动调用 LLM（消耗 tokens）；默认关闭，需手动点击右侧分析按钮</span>
        </div>
        <Toggle
          enabled={settings.autoAnalyze}
          onToggle={() => onChange({ autoAnalyze: !settings.autoAnalyze })}
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">深度模式</span>
          <span className="setting-desc text-gray-500 text-xs">分析时提取新闻全文，耗时较长但准确度更高</span>
        </div>
        <Toggle
          enabled={settings.deepMode}
          onToggle={() => onChange({ deepMode: !settings.deepMode })}
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">界面语言 / Language</span>
          <span className="setting-desc text-gray-500 text-xs">UI and AI analysis output language</span>
        </div>
        <div className="flex gap-2">
          {LANGUAGES.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              onClick={() => onChange({ language: value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.language === value
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <UpdateChecker />
    </div>
  );
};
