import { PROVIDER_DEFAULTS } from '../shared/constants';

// Sidecar 全局配置常量（所有默认值的唯一来源）

/** 重新导出跨端共享的默认配置 */
export { PROVIDER_DEFAULTS };

/** Prompt 正文截断长度（字符数） */
export const CONTENT_LIMITS = {
  openai:    1000,
  ollama:     800,
  anthropic: 1500, // Claude 上下文窗口更大，可容纳更多内容
  deepseek:  1000,
  fullContent: 3000,
} as const;

/** 超时时间（毫秒） */
export const TIMEOUTS = {
  openai:    60_000,
  ollama:   120_000,
  anthropic: 90_000, // Claude 推理延迟可能高于 GPT-4o
  deepseek:  60_000,
  pageNavigation: 15_000,
  pageWait: 1_000,
  contentExtraction: 10_000,
} as const;

/** 深度模式最大正文提取数 */
export const DEEP_MODE_MAX_ARTICLES = 3;

