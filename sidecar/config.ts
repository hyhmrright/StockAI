import { PROVIDER_PROFILES } from '../shared/constants';

// Sidecar 全局配置常量（所有默认值的唯一来源）

/** 重新导出跨端共享的 Provider 档案 */
export { PROVIDER_PROFILES };

/** 非 Provider 维度的内容限制（所有 provider 共用） */
export const CONTENT_LIMITS = {
  fullContent: 3000,
} as const;

/** 非 Provider 维度的超时（Playwright 相关） */
export const TIMEOUTS = {
  pageNavigation: 15_000,
  pageWait: 1_000,
  contentExtraction: 10_000,
} as const;

/** 深度模式最大正文提取数 */
export const DEEP_MODE_MAX_ARTICLES = 3;

// 注：各 provider 的精选模型目录已迁至 shared/constants.ts 的 STATIC_MODELS（带 i18n 标签），
// 列模型逻辑见 cli-handlers.ts 的 handleListModels。

/** Playwright 浏览器启动参数 */
export const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
];

/** Playwright 浏览器上下文默认配置 */
export const BROWSER_CONTEXT_DEFAULTS = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN',
};
