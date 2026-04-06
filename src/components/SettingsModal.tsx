import React, { useState, useEffect } from "react";
import { X, Settings as SettingsIcon, Globe, Key, Cpu, Save, Bot, User, CheckCircle2 } from "lucide-react";
import { useSettings, Settings } from "../hooks/useSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "general" | "providers";

/**
 * 升级后的设置中心 - 参考 Cherry Studio 风格
 * 采用侧边栏导航 + 内容区的现代桌面端布局
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, isLoading } = useSettings();
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [activeTab, setActiveTab] = useState<Tab>("providers");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaveStatus("saving");
    await updateSettings(localSettings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl h-[550px] overflow-hidden flex animate-in zoom-in-95 duration-200">
        
        {/* 左侧侧边栏导航 */}
        <aside className="w-56 bg-black/20 border-r border-white/5 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-3 px-3 py-4 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="font-bold text-gray-100">系统设置</span>
          </div>

          {[
            { id: "general", label: "常规设置", icon: User },
            { id: "providers", label: "模型服务", icon: Bot },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
                activeTab === tab.id 
                  ? "bg-emerald-500/10 text-emerald-400 font-medium" 
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          
          <div className="mt-auto p-4 text-[10px] text-gray-600 font-mono">
            StockAI v0.1.0-alpha
          </div>
        </aside>

        {/* 右侧主内容区 */}
        <section className="flex-1 flex flex-col bg-panel">
          {/* 内容头部 */}
          <header className="px-8 py-5 flex items-center justify-between border-b border-white/5 bg-panel/50 backdrop-blur-sm sticky top-0 z-10">
            <h3 className="text-base font-semibold text-gray-100">
              {activeTab === "general" ? "常规设置" : "模型服务配置"}
            </h3>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* 表单内容 */}
          <div className="flex-1 p-8 overflow-y-auto scrollbar-hide space-y-8 animate-slide-in">
            {activeTab === "general" ? (
              <div className="space-y-6">
                <div className="setting-row">
                  <div className="setting-label">
                    <span className="setting-title">自动分析</span>
                    <span className="setting-desc">点击关注列表时自动开始分析</span>
                  </div>
                  <div className="w-10 h-5 bg-emerald-500/20 rounded-full relative cursor-pointer">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-emerald-500 rounded-full shadow-sm" />
                  </div>
                </div>
                <div className="setting-row">
                  <div className="setting-label">
                    <span className="setting-title">深度模式</span>
                    <span className="setting-desc">分析时提取新闻全文，耗时较长但准确度更高</span>
                  </div>
                  <div className="w-10 h-5 bg-gray-800 rounded-full relative cursor-pointer">
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-500 rounded-full shadow-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">选择服务提供商</label>
                  <div className="grid grid-cols-2 gap-3">
                    {["openai", "ollama"].map((m) => (
                      <button
                        key={m}
                        onClick={() => setLocalSettings({ ...localSettings, model: m as "openai" | "ollama" })}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                          localSettings.model === m 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                            : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5"
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${localSettings.model === m ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-gray-600"}`} />
                        <span className="capitalize font-medium">{m}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* API Key (仅 OpenAI) */}
                  {localSettings.model === "openai" && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                          <Key className="w-3 h-3" /> API Key
                        </label>
                        <span className="text-[10px] text-gray-600">Encrypted locally</span>
                      </div>
                      <input
                        type="password"
                        value={localSettings.apiKey}
                        onChange={(e) => setLocalSettings({ ...localSettings, apiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                      />
                    </div>
                  )}

                  {/* Base URL */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                      <Globe className="w-3 h-3" /> 接口地址 (Endpoint)
                    </label>
                    <input
                      type="text"
                      value={localSettings.baseUrl}
                      onChange={(e) => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
                      placeholder={localSettings.model === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434"}
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
                      value={localSettings.ollamaModel}
                      onChange={(e) => setLocalSettings({ ...localSettings, ollamaModel: e.target.value })}
                      placeholder="gpt-4o, llama3, qwen2..."
                      className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 底部保存栏 */}
          <footer className="px-8 py-5 border-t border-white/5 bg-black/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  正在保存...
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-2 text-xs text-emerald-500 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  设置已成功保存
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                关闭
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading || saveStatus === "saving"}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                保存更改
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
};
