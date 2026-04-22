import { ProviderType } from "./types";

/**
 * 每个 Provider 的完整档案——baseUrl、model、内容截断、超时都在同一处。
 * 合并前分散在 PROVIDER_DEFAULTS / CONTENT_LIMITS / TIMEOUTS 三处，新增 provider 易漏配。
 * 现在 TypeScript 会在新增 ProviderType 时强制补齐所有字段。
 */
export interface ProviderProfile {
  baseUrl: string;
  model: string;
  contentLimit: number; // prompt 正文截断长度（字符数）
  timeout: number;      // 请求超时（毫秒）
}

export const PROVIDER_PROFILES: Record<ProviderType, ProviderProfile> = {
  openai:    { baseUrl: 'https://api.openai.com/v1',   model: 'gpt-4o',                       contentLimit: 1000, timeout:  60_000 },
  ollama:    { baseUrl: 'http://127.0.0.1:11434',      model: 'qwen3.5:9b',                   contentLimit:  800, timeout: 120_000 },
  anthropic: { baseUrl: 'https://api.anthropic.com',   model: 'claude-3-5-sonnet-20241022',   contentLimit: 1500, timeout:  90_000 },
  deepseek:  { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',                contentLimit: 1000, timeout:  60_000 },
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
