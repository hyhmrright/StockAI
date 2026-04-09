// Sidecar 全局配置常量（所有默认值的唯一来源）

/** 各 Provider 的默认配置 */
export const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'qwen3.5:9b',
  },
} as const;

/** Prompt 正文截断长度（字符数） */
export const CONTENT_LIMITS = {
  openai: 1000,
  ollama: 800,
  fullContent: 3000,
} as const;

/** 超时时间（毫秒） */
export const TIMEOUTS = {
  openai: 60_000,
  ollama: 120_000,
  pageNavigation: 15_000,
  pageWait: 1_000,
  contentExtraction: 10_000,
} as const;

/** 深度模式最大正文提取数 */
export const DEEP_MODE_MAX_ARTICLES = 3;

