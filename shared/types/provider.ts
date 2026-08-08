// AI Provider / 角色分级模型 / 语言：settings.json 与 configResolver 的契约
/** AI 服务提供商类型 */
export type ProviderType = 'openai' | 'ollama' | 'anthropic' | 'deepseek' | 'glm';

/**
 * LLM 角色：不同任务可指定不同模型，让核心研判用聪明模型、廉价批量活用便宜模型。
 * - brain：核心研判（基础 AI 分析 + 13 位大师 + 综合结论）
 * - quick：快速标注（新闻情绪逐条分类）
 * - summarize：对话追问（基于已有上下文的多轮问答）
 */
export type Role = 'brain' | 'quick' | 'summarize';

/**
 * 单个角色的模型选择：只决定「用哪个 provider 的哪个 model」；
 * apiKey/baseUrl 一律从 providerConfigs[provider] 取，不在此重复存储。
 */
export interface ModelChoice {
  provider: ProviderType;
  model: string;
}

/**
 * 角色 → 模型选择映射（Partial：某角色缺省时回退到 activeProvider）。
 * 默认为空对象，即所有角色都跟随当前活跃 provider，开箱行为与历史一致。
 */
export type RoleModels = Partial<Record<Role, ModelChoice>>;

/** 界面与 AI 回答语言 */
export type Language = 'zh' | 'en' | 'ja';
