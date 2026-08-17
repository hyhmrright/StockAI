import { ProviderType, Language, MasterMeta } from './types';

/**
 * 每个 Provider 的完整档案——baseUrl、model、内容截断、超时都在同一处。
 * 合并前分散在 PROVIDER_DEFAULTS / CONTENT_LIMITS / TIMEOUTS 三处，新增 provider 易漏配。
 * 现在 TypeScript 会在新增 ProviderType 时强制补齐所有字段。
 */
export interface ProviderProfile {
  baseUrl: string;
  model: string;
  contentLimit: number; // prompt 正文截断长度（字符数）
  timeout: number; // 请求超时（毫秒）
}

export const PROVIDER_PROFILES: Record<ProviderType, ProviderProfile> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    contentLimit: 1000,
    timeout: 60_000,
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3.5:4b',
    contentLimit: 800,
    timeout: 240_000,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-20241022',
    contentLimit: 1500,
    timeout: 90_000,
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    contentLimit: 1000,
    timeout: 60_000,
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.1',
    contentLimit: 1000,
    timeout: 60_000,
  },
};

/** 默认设置对象。autoAnalyze 默认关——AI 分析改为按需触发，避免无脑消耗 token */
export const DEFAULT_SETTINGS = {
  activeProvider: 'ollama' as ProviderType,
  autoAnalyze: false,
  deepMode: true,
  language: 'zh' as Language,
};

/**
 * 配置格式版本号。每次 Settings / Sidecar 配置结构发生 breaking change 时递增。
 * Sidecar 会拒绝不匹配此版本的配置，防止静默降级。
 * v3：新增 roleModels（按角色分级模型）。
 */
export const CONFIG_VERSION = '3';

/** 静态模型目录的一项：value 为模型 id，tagKey 为 i18n 标签 key（前端下拉显示「id（标签）」） */
export interface StaticModel {
  value: string;
  tagKey: string;
}

/**
 * 各 Provider 的精选静态模型目录（带 i18n 标签）。
 * 用途：① 前端模型下拉的基础选项与标签展示；② 动态拉取返回空或失败时的兜底。
 * 非穷举——用户始终可在输入框手动填写任意模型名。
 */
export const STATIC_MODELS: Record<ProviderType, StaticModel[]> = {
  openai: [
    { value: 'gpt-4o', tagKey: 'model_tag_flagship' },
    { value: 'gpt-4o-mini', tagKey: 'model_tag_fast' },
    { value: 'gpt-4-turbo', tagKey: 'model_tag_long' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', tagKey: 'model_tag_flagship' },
    { value: 'claude-3-5-haiku-20241022', tagKey: 'model_tag_fast' },
    { value: 'claude-3-opus-20240229', tagKey: 'model_tag_reasoning' },
  ],
  deepseek: [
    { value: 'deepseek-v4-pro', tagKey: 'model_tag_flagship' },
    { value: 'deepseek-chat', tagKey: 'model_tag_value' },
    { value: 'deepseek-reasoner', tagKey: 'model_tag_reasoning' },
  ],
  glm: [
    { value: 'glm-5.1', tagKey: 'model_tag_flagship' },
    { value: 'glm-4-flash', tagKey: 'model_tag_fast' },
    { value: 'glm-4-long', tagKey: 'model_tag_long' },
  ],
  ollama: [],
};

/**
 * Provider 能力位：是否本地、动态列模型的端点路径与鉴权风格。
 * 无 modelsPath 表示该 provider 无公开列模型端点，仅用静态目录（防御兜底，当前所有云端 provider 均有端点）。
 * modelsPath 拼到用户配置的 baseUrl 之后——注意各 baseUrl 是否已含 /v1。
 */
export interface ProviderCaps {
  modelsPath?: string;
  authStyle?: 'bearer' | 'anthropic';
}

export const PROVIDER_CAPS: Record<ProviderType, ProviderCaps> = {
  openai: { modelsPath: '/models', authStyle: 'bearer' }, // baseUrl 已含 /v1
  ollama: {}, // 走 ollama SDK，非 HTTP /models
  anthropic: { modelsPath: '/v1/models', authStyle: 'anthropic' }, // baseUrl 为根，需补 /v1
  deepseek: { modelsPath: '/models', authStyle: 'bearer' }, // baseUrl 为根，列模型在 /models
  glm: { modelsPath: '/models', authStyle: 'bearer' }, // baseUrl 已含 /api/paas/v4
};

/** 深度分析默认启用的大师 ID 列表 */
export const DEFAULT_SELECTED_MASTERS: string[] = [
  'warren-buffett',
  'ben-graham',
  'michael-burry',
  'cathie-wood',
  'aswath-damodaran',
];

/**
 * 13 位投资大师的展示元数据——**两侧唯一来源**。
 *
 * 曾经这张表在 `sidecar/agents/masters/*.ts`（每人一份字面量）与
 * `src/components/DeepAnalysis/master-meta.ts`（整表重抄）各存一份。前端不能 import
 * `sidecar/`（单向依赖），但两侧都能 import `shared/`——所以双写从来不是必需的，
 * 漏改前端那份的表现是「深度分析卡片不显示姓名」，且不报任何错。
 *
 * 顺序即前端设置页的展示顺序。新增大师改这里 + 加 `agents/masters/<id>.ts` 两处，
 * `masters-common.test.ts` 会双向校验「表里每个 id 都有文件、目录里每个文件都在表里」。
 */
export const MASTER_META: MasterMeta[] = [
  {
    id: 'warren-buffett',
    name: 'Warren Buffett',
    nameZh: '沃伦·巴菲特',
    style: 'Value Investing',
    styleZh: '价值投资',
  },
  {
    id: 'ben-graham',
    name: 'Ben Graham',
    nameZh: '本杰明·格雷厄姆',
    style: 'Deep Value',
    styleZh: '深度价值',
  },
  {
    id: 'charlie-munger',
    name: 'Charlie Munger',
    nameZh: '查理·芒格',
    style: 'Quality Investing',
    styleZh: '品质投资',
  },
  {
    id: 'michael-burry',
    name: 'Michael Burry',
    nameZh: '迈克尔·伯里',
    style: 'Contrarian Value',
    styleZh: '逆向价值',
  },
  {
    id: 'cathie-wood',
    name: 'Cathie Wood',
    nameZh: '凯西·伍德',
    style: 'Disruptive Innovation',
    styleZh: '颠覆式创新',
  },
  {
    id: 'peter-lynch',
    name: 'Peter Lynch',
    nameZh: '彼得·林奇',
    style: 'Growth at Value',
    styleZh: '成长价值',
  },
  {
    id: 'phil-fisher',
    name: 'Phil Fisher',
    nameZh: '菲利普·费雪',
    style: 'Growth Investing',
    styleZh: '成长投资',
  },
  {
    id: 'bill-ackman',
    name: 'Bill Ackman',
    nameZh: '比尔·阿克曼',
    style: 'Activist Investing',
    styleZh: '激进投资',
  },
  {
    id: 'mohnish-pabrai',
    name: 'Mohnish Pabrai',
    nameZh: '莫尼什·帕布莱',
    style: 'Dhandho Investing',
    styleZh: '低风险高回报',
  },
  {
    id: 'nassim-taleb',
    name: 'Nassim Taleb',
    nameZh: '纳西姆·塔勒布',
    style: 'Antifragility',
    styleZh: '反脆弱',
  },
  {
    id: 'stanley-druckenmiller',
    name: 'Stanley Druckenmiller',
    nameZh: '斯坦利·德鲁肯米勒',
    style: 'Macro Growth',
    styleZh: '宏观成长',
  },
  {
    id: 'aswath-damodaran',
    name: 'Aswath Damodaran',
    nameZh: '阿斯瓦斯·达摩达兰',
    style: 'Valuation',
    styleZh: '估值',
  },
  {
    id: 'rakesh-jhunjhunwala',
    name: 'Rakesh Jhunjhunwala',
    nameZh: '拉凯什·金君瓦拉',
    style: 'Long-term Wealth',
    styleZh: '长期财富',
  },
];

/**
 * 按 id 取元数据；查不到即抛。
 *
 * 大师文件用它取自己的 meta，所以「文件建了但忘了加进 MASTER_META」会在模块加载时
 * 立刻炸掉，而不是安静地跑出一个没名字的大师。
 */
export function masterMetaById(id: string): MasterMeta {
  const meta = MASTER_META.find((m) => m.id === id);
  if (!meta)
    throw new Error(`未登记的大师 id: ${id}——请先在 shared/constants.ts 的 MASTER_META 加一条`);
  return meta;
}

/** 年化交易日数 */
export const TRADING_DAYS_PER_YEAR = 252;

/** 年化无风险利率 */
export const RISK_FREE_RATE = 0.045;

/**
 * 一次批量报价的标的上限。
 *
 * 两侧都要用，所以放 shared：Sidecar 拿它当守卫（超限抛错而非截断——截断会让持仓少算几只、
 * 总额却照样显示成完整数字），前端拿它切批（关注列表/持仓超过这个数就分几次调用，
 * 而不是让整批报错）。
 */
export const MAX_BATCH_QUOTES = 50;
