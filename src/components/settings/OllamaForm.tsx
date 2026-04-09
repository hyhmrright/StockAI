import React, { useState, useEffect } from "react";
import { Globe, Cpu, RefreshCw, AlertCircle } from "lucide-react";
import { Settings } from "../../hooks/useSettings";
import { listModels } from "../../lib/ipc";
import { FormInput } from "./FormInput";

interface OllamaFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * Ollama 配置表单组件
 * 支持从本地 Ollama 服务自动拉取模型列表
 */
export function OllamaForm({ settings, onChange }: OllamaFormProps): React.ReactElement {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 尝试拉取模型列表
  async function fetchModels() {
    setIsFetching(true);
    setError(null);
    try {
      const models = await listModels("ollama", settings.baseUrl);
      if (models.length > 0) {
        setAvailableModels(models);
      } else {
        setError("未发现可用模型，请确保 Ollama 服务已启动。");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`获取模型列表失败: ${msg}`);
    } finally {
      setIsFetching(false);
    }
  }

  // 初始加载
  useEffect(() => {
    fetchModels();
  }, [settings.baseUrl]);

  const refreshButton = (
    <button
      onClick={fetchModels}
      disabled={isFetching}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-400 disabled:opacity-50 transition-colors"
      title="刷新模型列表"
    >
      <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <FormInput
        label="接口地址 (Endpoint)"
        icon={<Globe className="w-3 h-3" />}
        value={settings.baseUrl}
        onChange={(v) => onChange({ baseUrl: v })}
        placeholder="http://localhost:11434"
        mono
        suffix={refreshButton}
      />

      {/* 模型名称 */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Cpu className="w-3 h-3" /> 模型名称
        </label>

        <div className="space-y-3">
          {availableModels.length > 0 && (
            <select
              value={availableModels.includes(settings.aiModel) ? settings.aiModel : ""}
              onChange={(e) => {
                if (e.target.value) onChange({ aiModel: e.target.value });
              }}
              className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled>从已安装模型中选择...</option>
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            value={settings.aiModel}
            onChange={(e) => onChange({ aiModel: e.target.value })}
            placeholder="或者手动输入: llama3, qwen2..."
            className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
          />
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-amber-500/80 text-[10px] mt-1 px-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
      </div>
    </div>
  );
}
