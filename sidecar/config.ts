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
  /**
   * 整条抓取策略链的总预算（见 scraper.ts）。
   * 60s 而非更短：CI 实测正常回退路径最慢跑到 29.9s（688693），压到 45s 会误杀真结果。
   */
  strategyChain: 60_000,
} as const;

/**
 * 外部数据源抓取策略的唯一来源（UA / 超时）——所有 fetch 一律经 http.ts 的
 * fetchWithPolicy 应用本组默认值，不要在各数据源模块另写 UA 或 AbortSignal.timeout。
 * userAgent 同时供 Playwright 上下文使用，保证浏览器路径与 fetch 路径伪装一致。
 */
export const HTTP_DEFAULTS = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  /** 常规行情/财务接口：超时即中止，由多源回退或上游 Promise.allSettled 兜底 */
  timeoutMs: 8_000,
  /** 分页聚合、交易所互动平台等重接口的放宽超时 */
  slowTimeoutMs: 10_000,
} as const;

/** 深度模式最大正文提取数 */
export const DEEP_MODE_MAX_ARTICLES = 3;

// 注：各 provider 的精选模型目录已迁至 shared/constants.ts 的 STATIC_MODELS（带 i18n 标签），
// 列模型逻辑见 cli-handlers/models.ts 的 handleListModels。

/** Playwright 浏览器启动参数 */
export const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
];

/** Playwright 浏览器上下文默认配置（UA 复用 HTTP_DEFAULTS，与 fetch 路径保持一致） */
export const BROWSER_CONTEXT_DEFAULTS = {
  userAgent: HTTP_DEFAULTS.userAgent,
  locale: 'zh-CN',
};
