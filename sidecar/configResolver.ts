import { PROVIDER_PROFILES, CONFIG_VERSION, DEFAULT_SELECTED_MASTERS } from '../shared/constants';
import type { ProviderType, Language, Role } from '../shared/types';

/** 单个角色解析后的完整凭证（provider + 可直接调用的 key/baseUrl/model） */
export interface ResolvedRole {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ResolvedConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  deepMode: boolean;
  masterAnalysis: boolean;
  selectedMasters: string[];
  language: Language;
  /** 按角色分级模型；顶层 provider/apiKey/baseUrl/modelName 即 roles.brain 的派生（旧调用点零改动） */
  roles: Record<Role, ResolvedRole>;
}

const VALID_LANGUAGES: Language[] = ['zh', 'en', 'ja'];

/** 从 providerConfigs 解析某 provider 的凭证；baseUrl/model 缺失时回退 PROVIDER_PROFILES */
function resolveProviderCreds(obj: Record<string, any>, provider: ProviderType): ResolvedRole {
  const cfg: Record<string, string> = obj.providerConfigs?.[provider] ?? {};
  const defaults = PROVIDER_PROFILES[provider];
  return {
    provider,
    apiKey: cfg.apiKey ?? '',
    baseUrl: cfg.baseUrl ?? defaults.baseUrl,
    model: cfg.model ?? defaults.model,
  };
}

/**
 * 解析单个角色的模型：
 * - roleModels[role] 缺省 → 跟随 activeProvider（与历史行为一致）
 * - 指定了云端 provider 却未配置 apiKey → 同样回退 active，避免无声跑到未配置的服务商
 * - 否则用该 provider 的凭证 + role 指定的 model
 */
function resolveRole(obj: Record<string, any>, role: Role, active: ResolvedRole): ResolvedRole {
  const choice = obj.roleModels?.[role] as { provider?: string; model?: string } | undefined;
  if (!choice?.provider) return active;
  const provider: ProviderType =
    choice.provider in PROVIDER_PROFILES ? (choice.provider as ProviderType) : active.provider;
  const creds = resolveProviderCreds(obj, provider);
  // 本地 Ollama 无需 key；云端 provider 无 key 则回退 active
  if (provider !== 'ollama' && !creds.apiKey) return active;
  return { ...creds, model: choice.model || creds.model };
}

/**
 * 从 Rust 传入的原始配置 JSON 中解析有效配置。
 * 仅支持当前格式版本（CONFIG_VERSION）；版本不匹配时抛出，
 * 错误由调用方序列化为 { error } 写入 stdout。
 */
export function resolveConfig(raw: unknown): ResolvedConfig {
  const obj = raw as Record<string, any>;

  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    throw new Error('配置文件为空，请进入设置界面并保存配置后再试。');
  }

  if (String(obj._version) !== String(CONFIG_VERSION)) {
    throw new Error(
      `配置格式版本不兼容（期望 "${CONFIG_VERSION}"，当前为 "${obj._version ?? '无'}"）。请点击右上角设置图标，重新保存模型配置以完成迁移。`,
    );
  }

  const rawProvider = obj.activeProvider ?? 'ollama';
  const activeProvider: ProviderType =
    rawProvider in PROVIDER_PROFILES ? (rawProvider as ProviderType) : 'ollama';
  const active = resolveProviderCreds(obj, activeProvider);

  const brain = resolveRole(obj, 'brain', active);
  const quick = resolveRole(obj, 'quick', active);
  const summarize = resolveRole(obj, 'summarize', active);

  const rawLang = obj.language;
  const language: Language = VALID_LANGUAGES.includes(rawLang) ? (rawLang as Language) : 'zh';

  return {
    // 顶层字段 = brain 角色派生：基础分析/handleAnalysis 等旧路径零改动即用核心研判模型
    provider: brain.provider,
    apiKey: brain.apiKey,
    baseUrl: brain.baseUrl,
    modelName: brain.model,
    deepMode: obj.deepMode !== false,
    masterAnalysis: obj.masterAnalysis === true,
    selectedMasters: Array.isArray(obj.selectedMasters)
      ? obj.selectedMasters
      : DEFAULT_SELECTED_MASTERS,
    language,
    roles: { brain, quick, summarize },
  };
}
