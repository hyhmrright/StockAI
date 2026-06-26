import React, { useState, useEffect, useRef } from 'react';
import { Cpu, RefreshCw, AlertCircle } from 'lucide-react';
import { ProviderType } from '../../hooks/useSettings';
import { STATIC_MODELS, PROVIDER_CAPS } from '../../../shared/constants';
import { listModels, ServiceError } from '../../lib/ipc';
import { useLanguage } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { FormInput } from './FormInput';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

interface ModelSelectProps {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  value: string;
  onChange: (model: string) => void;
}

interface ModelOption {
  value: string;
  label: string;
}

/** 把 list-models 错误码映射成本地化提示 */
function formatListModelsError(err: unknown, t: TFn): string {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case 'ERR_LIST_MODELS_TIMEOUT':
        return t('err_list_models_timeout');
      case 'ERR_LIST_MODELS_AUTH':
        return t('err_list_models_auth');
      case 'ERR_LIST_MODELS_NETWORK':
        return t('err_list_models_network');
      case 'ERR_LIST_MODELS_SERVER':
        return t('err_list_models_server', { message: err.message });
      case 'ERR_LIST_MODELS_BAD_REQUEST':
        return t('err_list_models_bad_request', { message: err.message });
      default:
        return t('err_list_models_generic', { message: err.message });
    }
  }
  return t('err_list_models_generic', {
    message: err instanceof Error ? err.message : String(err),
  });
}

/** 合并静态精选目录（带 i18n 标签）与动态拉取结果，静态在前、去重 */
function buildOptions(provider: ProviderType, dynamic: string[], t: TFn): ModelOption[] {
  const staticEntries = (STATIC_MODELS[provider] ?? []).map((m) => ({
    value: m.value,
    label: `${m.value} (${t(m.tagKey as TranslationKey)})`,
  }));
  const seen = new Set(staticEntries.map((o) => o.value));
  const dynamicEntries = dynamic.filter((v) => !seen.has(v)).map((v) => ({ value: v, label: v }));
  return [...staticEntries, ...dynamicEntries];
}

/**
 * 可复用模型选择器：对所有 provider 动态拉取真实模型列表，叠加静态精选目录（带标签），
 * 并保留手动输入兜底。被 ProviderForm 与 RoleModelMatrix 共用。
 */
export function ModelSelect({
  provider,
  baseUrl,
  apiKey,
  value,
  onChange,
}: ModelSelectProps): React.ReactElement {
  const { t } = useLanguage();
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 自增请求 id：仅最新一次请求允许写回 state，杜绝切换 provider / 手动刷新并发时的结果串台
  const reqIdRef = useRef(0);

  async function load() {
    const myId = ++reqIdRef.current;
    // 云端 provider 未配 key 时跳过拉取（否则一进设置页就以空 key 命中 401），静态目录由 buildOptions 兜底
    if (PROVIDER_CAPS[provider].modelsPath && !apiKey) {
      setDynamicModels([]);
      setFetchError(null);
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    setFetchError(null);
    try {
      const models = await listModels(provider, baseUrl, apiKey);
      if (myId !== reqIdRef.current) return; // 已被更新的请求取代
      setDynamicModels(models);
      if (models.length === 0 && (STATIC_MODELS[provider] ?? []).length === 0) {
        setFetchError(t('no_models_found'));
      }
    } catch (err) {
      if (myId !== reqIdRef.current) return;
      setDynamicModels([]);
      setFetchError(formatListModelsError(err, t));
    } finally {
      if (myId === reqIdRef.current) setIsFetching(false);
    }
  }

  // provider/baseUrl 变化时 debounce 重新拉取（apiKey 边输边变，不自动拉，由刷新按钮手动触发）
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load();
    }, 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, baseUrl]);

  function handleRefresh() {
    clearTimeout(debounceRef.current);
    load();
  }

  const options = buildOptions(provider, dynamicModels, t);
  const refreshButton = (
    <button
      onClick={handleRefresh}
      disabled={isFetching}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-emerald-400 disabled:opacity-50 transition-colors"
      title={t('refresh_models')}
    >
      <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-3">
      {options.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
            <Cpu className="w-3 h-3" /> {t('available_models')}
          </label>
          <select
            value={options.some((o) => o.value === value) ? value : ''}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
            className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
          >
            <option value="" disabled>
              {t('model_select_placeholder')}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <FormInput
        label={t('label_model')}
        icon={<Cpu className="w-3 h-3" />}
        value={value}
        onChange={onChange}
        placeholder={t('model_manual_placeholder')}
        mono
        suffix={refreshButton}
      />

      {fetchError && (
        <div className="flex items-center gap-1.5 text-amber-500/80 text-[10px] px-1">
          <AlertCircle className="w-3 h-3" /> {fetchError}
        </div>
      )}
    </div>
  );
}
