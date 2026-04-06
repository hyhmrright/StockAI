import React from "react";
import { Key, Globe, Cpu } from "lucide-react";
import { Settings } from "../../hooks/useSettings";

interface OpenAIFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * OpenAI 配置表单组件
 */
export const OpenAIForm: React.FC<OpenAIFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* API Key */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
            <Key className="w-3 h-3" /> API Key
          </label>
          <span className="text-[10px] text-gray-600">本地加密存储</span>
        </div>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
        />
      </div>

      {/* Base URL */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> 接口地址 (Endpoint)
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
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
          value={settings.ollamaModel}
          onChange={(e) => onChange({ ollamaModel: e.target.value })}
          placeholder="gpt-4o..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>
    </div>
  );
};
