import React, { useState, useEffect } from "react";
import { X, Settings as SettingsIcon, Globe, Key, Cpu, Save } from "lucide-react";
import { useSettings, Settings } from "../hooks/useSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 设置模态框组件
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, isLoading } = useSettings();
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  // 当外部 settings 加载完成时同步到本地状态
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    await updateSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-100">系统设置</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-6 space-y-5">
          {/* 提供商选择 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI 提供商</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setLocalSettings({ ...localSettings, model: "openai" })}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg border transition-all ${
                  localSettings.model === "openai" 
                    ? "bg-blue-600/10 border-blue-500 text-blue-400" 
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                }`}
              >
                OpenAI
              </button>
              <button
                onClick={() => setLocalSettings({ ...localSettings, model: "ollama" })}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg border transition-all ${
                  localSettings.model === "ollama" 
                    ? "bg-blue-600/10 border-blue-500 text-blue-400" 
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750"
                }`}
              >
                Ollama
              </button>
            </div>
          </div>

          {/* API Key (仅 OpenAI) */}
          {localSettings.model === "openai" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Key className="w-3 h-3" /> API Key
              </label>
              <input
                type="password"
                value={localSettings.apiKey}
                onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Globe className="w-3 h-3" /> {localSettings.model === "openai" ? "Base URL" : "Ollama Host"}
            </label>
            <input
              type="text"
              value={localSettings.baseUrl}
              onChange={(e) => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
              placeholder={localSettings.model === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434"}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Cpu className="w-3 h-3" /> 模型名称
            </label>
            <input
              type="text"
              value={localSettings.ollamaModel}
              onChange={(e) => setLocalSettings({ ...localSettings, ollamaModel: e.target.value })}
              placeholder="gpt-4o, llama3, etc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-6 border-t border-gray-800 bg-gray-900/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};
