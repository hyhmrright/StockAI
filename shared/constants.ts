import { ProviderType } from "./types";

/** 各 Provider 的默认配置 */
export const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; model: string }> = {
  openai:    { baseUrl: 'https://api.openai.com/v1',   model: 'gpt-4o' },
  ollama:    { baseUrl: 'http://localhost:11434',       model: 'qwen3.5:9b' },
  anthropic: { baseUrl: 'https://api.anthropic.com',   model: 'claude-3-5-sonnet-20241022' },
  deepseek:  { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
};

/** 默认设置对象 */
export const DEFAULT_SETTINGS = {
  activeProvider: "ollama" as ProviderType,
  autoAnalyze: true,
  deepMode: true,
};

/**
 * 配置格式版本号。每次 Settings / Sidecar 配置结构发生 breaking change 时递增。
 * Sidecar 会拒绝不匹配此版本的配置，防止静默降级。
 */
export const CONFIG_VERSION = "2";
