import React from "react";
import { Globe, Cpu } from "lucide-react";
import { Settings } from "../../hooks/useSettings";

interface OllamaFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * Ollama 配置表单组件
 */
export const OllamaForm: React.FC<OllamaFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Base URL */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> 接口地址 (Endpoint)
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434"
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>

      {/* Model Name */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Cpu className="w-3 h-3" /> 模型名称
        </label>
        <input
          type="text"
          value={settings.aiModel}
          onChange={(e) => onChange({ aiModel: e.target.value })}
          placeholder="llama3, qwen2..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>
    </div>
  );
};
