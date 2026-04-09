import React, { useState, useEffect, useRef } from "react";
import { Key, Globe, Cpu, RefreshCw, AlertCircle } from "lucide-react";
import { ProviderConfig, ProviderType } from "../../hooks/useSettings";
import { listModels } from "../../lib/ipc";
import { FormInput } from "./FormInput";

interface ProviderFormProps {
  providerType: ProviderType;
  config: ProviderConfig;
  onChange: (patch: Partial<ProviderConfig>) => void;
}

/**
 * 统一的 Provider 配置表单
 * 根据 providerType 动态显示/隐藏各字段
 */
export function ProviderForm({ providerType, config, onChange }: ProviderFormProps): React.ReactElement {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isOllama = providerType === "ollama";
  // Anthropic 不暴露 baseUrl 字段（用固定端点，代理场景由高级用户自行处理）
  const showBaseUrl = providerType !== "anthropic";
  const showApiKey = providerType !== "ollama";

  // Ollama：切换到非 Ollama 时清理模型列表；切换回来时触发重新拉取
  useEffect(() => {
    if (!isOllama) {
      setAvailableModels([]);
      setFetchError(null);
      return;
    }

    const cancelled = { current: false };
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (cancelled.current) return;
      setIsFetching(true);
      setFetchError(null);
      try {
        const models = await listModels("ollama", config.baseUrl);
        if (cancelled.current) return;
        if (models.length > 0) {
          setAvailableModels(models);
        } else {
          setFetchError("未发现可用模型，请确保 Ollama 服务已启动。");
        }
      } catch (err) {
        if (!cancelled.current)
          setFetchError(`获取模型列表失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled.current) setIsFetching(false);
      }
    }, 500);

    return () => {
      cancelled.current = true;
      clearTimeout(debounceRef.current);
    };
  }, [config.baseUrl, isOllama]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleManualFetch() {
    // 清空 debounce 计时器，立即触发（复用 effect 中的逻辑等效为手动刷新）
    setAvailableModels([]);
    setFetchError(null);
    setIsFetching(true);
    listModels("ollama", config.baseUrl)
      .then((models) => {
        if (models.length > 0) setAvailableModels(models);
        else setFetchError("未发现可用模型，请确保 Ollama 服务已启动。");
      })
      .catch((err) => setFetchError(`获取模型列表失败: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setIsFetching(false));
  }

  const refreshButton = (
    <button
      onClick={handleManualFetch}
      disabled={isFetching}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-400 disabled:opacity-50 transition-colors"
      title="刷新模型列表"
    >
      <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {showApiKey && (
        <FormInput
          label="API Key"
          icon={<Key className="w-3 h-3" />}
          type="password"
          value={config.apiKey}
          onChange={(v) => onChange({ apiKey: v })}
          placeholder="sk-..."
          hint="本地加密存储"
        />
      )}

      {showBaseUrl && (
        <FormInput
          label="接口地址 (Endpoint)"
          icon={<Globe className="w-3 h-3" />}
          value={config.baseUrl}
          onChange={(v) => onChange({ baseUrl: v })}
          placeholder={isOllama ? "http://localhost:11434" : "https://api.openai.com/v1"}
          mono
          suffix={isOllama ? refreshButton : undefined}
        />
      )}

      {/* 模型名称：Ollama 额外提供已安装模型下拉框 */}
      <div className="space-y-3">
        {isOllama && availableModels.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> 已安装模型
            </label>
            <select
              value={availableModels.includes(config.model) ? config.model : ""}
              onChange={(e) => { if (e.target.value) onChange({ model: e.target.value }); }}
              className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled>从已安装模型中选择...</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <FormInput
          label="模型名称"
          icon={<Cpu className="w-3 h-3" />}
          value={config.model}
          onChange={(v) => onChange({ model: v })}
          placeholder={isOllama ? "或手动输入: llama3, qwen2..." : "模型名称"}
          mono
        />

        {isOllama && fetchError && (
          <div className="flex items-center gap-1.5 text-amber-500/80 text-[10px] px-1">
            <AlertCircle className="w-3 h-3" /> {fetchError}
          </div>
        )}
      </div>
    </div>
  );
}
