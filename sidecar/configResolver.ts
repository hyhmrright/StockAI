import { PROVIDER_PROFILES, CONFIG_VERSION } from '../shared/constants';
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

  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    throw new Error("配置文件为空，请进入设置界面并保存配置后再试。");
  }

  if (String(obj._version) !== String(CONFIG_VERSION)) {
    throw new Error(
      `配置格式版本不兼容（期望 "${CONFIG_VERSION}"，当前为 "${obj._version ?? '无'}"）。请点击右上角设置图标，重新保存模型配置以完成迁移。`
    );
  }

  const rawProvider = obj.activeProvider ?? 'ollama';
  const provider: ProviderType = rawProvider in PROVIDER_PROFILES ? rawProvider as ProviderType : 'ollama';
  const providerCfg: Record<string, string> = obj.providerConfigs?.[provider] ?? {};
  const defaults = PROVIDER_PROFILES[provider] ?? { baseUrl: '', model: '' };

  return {
    provider,
    apiKey:    providerCfg.apiKey   ?? '',
    baseUrl:   providerCfg.baseUrl  ?? defaults.baseUrl,
    modelName: providerCfg.model    ?? defaults.model,
    deepMode:  obj.deepMode !== false,
  };
}
