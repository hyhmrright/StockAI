import { PROVIDER_DEFAULTS, CONFIG_VERSION } from '../shared/constants';
import { ProviderType } from '../shared/types';

export interface ResolvedConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  deepMode: boolean;
}

/**
 * 从 Rust 传入的原始配置 JSON 中解析有效配置。
 * 仅支持当前格式版本（CONFIG_VERSION）；版本不匹配时抛出，
 * 错误由调用方序列化为 { error } 写入 stdout。
 */
export function resolveConfig(raw: unknown): ResolvedConfig {
  const obj = raw as Record<string, any>;

  if (obj._version !== CONFIG_VERSION) {
    throw new Error(
      `配置格式版本不兼容（期望 "${CONFIG_VERSION}"，收到 "${obj._version ?? '无'}"）。请在设置界面重新保存配置。`
    );
  }

  const provider = (obj.activeProvider ?? 'ollama') as ProviderType;
  const providerCfg: Record<string, string> = obj.providerConfigs?.[provider] ?? {};
  const defaults = PROVIDER_DEFAULTS[provider] ?? { baseUrl: '', model: '' };

  return {
    provider,
    apiKey:    providerCfg.apiKey   ?? '',
    baseUrl:   providerCfg.baseUrl  ?? defaults.baseUrl,
    modelName: providerCfg.model    ?? defaults.model,
    deepMode:  obj.deepMode !== false,
  };
}
