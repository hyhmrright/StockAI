import React from 'react';
import { Key, Globe } from 'lucide-react';
import { ProviderConfig, ProviderType } from '../../hooks/useSettings';
import { useLanguage } from '../../hooks/useLanguage';
import { FormInput } from './FormInput';
import { ModelSelect } from './ModelSelect';

interface ProviderFormProps {
  providerType: ProviderType;
  config: ProviderConfig;
  onChange: (patch: Partial<ProviderConfig>) => void;
}

/**
 * 统一的 Provider 配置表单：API Key + Endpoint + 模型选择。
 * 模型拉取/标签/手动输入逻辑统一在 ModelSelect（所有 provider 通用）。
 */
export function ProviderForm({
  providerType,
  config,
  onChange,
}: ProviderFormProps): React.ReactElement {
  const { t } = useLanguage();

  const isOllama = providerType === 'ollama';
  // Anthropic 不暴露 baseUrl 字段（用固定端点，代理场景由高级用户自行处理）
  const showBaseUrl = providerType !== 'anthropic';
  const showApiKey = providerType !== 'ollama';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {showApiKey && (
        <FormInput
          label={t('label_api_key')}
          icon={<Key className="w-3 h-3" />}
          type="password"
          value={config.apiKey}
          onChange={(v) => onChange({ apiKey: v })}
          placeholder="sk-..."
          hint={t('api_key_hint')}
        />
      )}

      {showBaseUrl && (
        <FormInput
          label={t('label_endpoint')}
          icon={<Globe className="w-3 h-3" />}
          value={config.baseUrl}
          onChange={(v) => onChange({ baseUrl: v })}
          placeholder={isOllama ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
          mono
        />
      )}

      <ModelSelect
        provider={providerType}
        baseUrl={config.baseUrl}
        apiKey={config.apiKey}
        value={config.model}
        onChange={(v) => onChange({ model: v })}
      />
    </div>
  );
}
