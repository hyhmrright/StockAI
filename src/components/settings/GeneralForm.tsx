import React from "react";
import { Settings } from "../../hooks/useSettings";

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

/**
 * 常规设置表单
 */
export const GeneralForm: React.FC<GeneralFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">自动分析</span>
          <span className="setting-desc text-gray-500 text-xs">点击关注列表时自动开始分析</span>
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
    </div>
  );
};
