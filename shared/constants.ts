import { ProviderType, Language } from "./types";

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
  ollama:    { baseUrl: 'http://127.0.0.1:11434',      model: 'qwen3.5:4b',                   contentLimit:  800, timeout: 240_000 },
  anthropic: { baseUrl: 'https://api.anthropic.com',   model: 'claude-3-5-sonnet-20241022',   contentLimit: 1500, timeout:  90_000 },
  deepseek:  { baseUrl: 'https://api.deepseek.com',    model: 'deepseek-v4-pro',              contentLimit: 1000, timeout:  60_000 },
  glm:       { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.1',             contentLimit: 1000, timeout:  60_000 },
};

/** 默认设置对象。autoAnalyze 默认关——AI 分析改为按需触发，避免无脑消耗 token */
export const DEFAULT_SETTINGS = {
  activeProvider: "ollama" as ProviderType,
  autoAnalyze: false,
  deepMode: true,
  language: "zh" as Language,
};

/**
 * 配置格式版本号。每次 Settings / Sidecar 配置结构发生 breaking change 时递增。
 * Sidecar 会拒绝不匹配此版本的配置，防止静默降级。
 * v3：新增 roleModels（按角色分级模型）。
 */
export const CONFIG_VERSION = "3";

/** 静态模型目录的一项：value 为模型 id，tagKey 为 i18n 标签 key（前端下拉显示「id（标签）」） */
export interface StaticModel {
  value: string;
  tagKey: string;
}

/**
 * 各 Provider 的精选静态模型目录（带 i18n 标签）。
 * 用途：① 前端模型下拉的基础选项与标签展示；② 动态拉取无端点（如 GLM）或返回空时的兜底。
 * 非穷举——用户始终可在输入框手动填写任意模型名。
 */
export const STATIC_MODELS: Record<ProviderType, StaticModel[]> = {
  openai: [
    { value: 'gpt-4o',                     tagKey: 'model_tag_flagship' },
    { value: 'gpt-4o-mini',                tagKey: 'model_tag_fast' },
    { value: 'gpt-4-turbo',                tagKey: 'model_tag_long' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', tagKey: 'model_tag_flagship' },
    { value: 'claude-3-5-haiku-20241022',  tagKey: 'model_tag_fast' },
    { value: 'claude-3-opus-20240229',     tagKey: 'model_tag_reasoning' },
  ],
  deepseek: [
    { value: 'deepseek-v4-pro',            tagKey: 'model_tag_flagship' },
    { value: 'deepseek-chat',              tagKey: 'model_tag_value' },
    { value: 'deepseek-reasoner',          tagKey: 'model_tag_reasoning' },
  ],
  glm: [
    { value: 'glm-5.1',                    tagKey: 'model_tag_flagship' },
    { value: 'glm-4-flash',                tagKey: 'model_tag_fast' },
    { value: 'glm-4-long',                 tagKey: 'model_tag_long' },
  ],
  ollama: [],
};

/**
 * Provider 能力位：是否本地、动态列模型的端点路径与鉴权风格。
 * 无 modelsPath 表示该 provider 无公开列模型端点（如 GLM），仅用静态目录。
 * modelsPath 拼到用户配置的 baseUrl 之后——注意各 baseUrl 是否已含 /v1。
 */
export interface ProviderCaps {
  isLocal: boolean;
  modelsPath?: string;
  authStyle?: 'bearer' | 'anthropic';
}

export const PROVIDER_CAPS: Record<ProviderType, ProviderCaps> = {
  openai:    { isLocal: false, modelsPath: '/models',    authStyle: 'bearer' },    // baseUrl 已含 /v1
  ollama:    { isLocal: true },                                                     // 走 ollama SDK，非 HTTP /models
  anthropic: { isLocal: false, modelsPath: '/v1/models', authStyle: 'anthropic' }, // baseUrl 为根，需补 /v1
  deepseek:  { isLocal: false, modelsPath: '/models',    authStyle: 'bearer' },    // baseUrl 为根，列模型在 /models
  glm:       { isLocal: false },                                                    // 无公开列模型端点，仅静态目录
};

/** 深度分析默认启用的大师 ID 列表 */
export const DEFAULT_SELECTED_MASTERS: string[] = [
  'warren-buffett',
  'ben-graham',
  'michael-burry',
  'cathie-wood',
  'aswath-damodaran',
];

/** 年化交易日数 */
export const TRADING_DAYS_PER_YEAR = 252;

/** 年化无风险利率 */
export const RISK_FREE_RATE = 0.045;
