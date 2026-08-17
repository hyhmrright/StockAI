import type {
  QuantBundle,
  StockNews,
  DeepAnalysisResult,
  MasterSignal,
  Language,
  MasterWeightInput,
} from '../shared/types';
import type { MasterFactors } from '../shared/types';
import type { ChatProvider, MasterAgent, MasterAnalysisContext } from './agents/types';
import { getSelectedMasters, DEFAULT_MASTER_IDS } from './agents/registry';
import { analyzeSentiment } from './agents/sentiment';
import { synthesize } from './agents/synthesizer';
import { cacheKey, readCache, writeCache, type CacheOptions } from './cache';
import { FUND_FLOW_CONSUMER_IDS } from './agents/masters/factory';
import { computeFactors, FACTOR_HISTORY_PERIODS, VALUE_FACTOR_CONSUMER_IDS } from './quant/factors';
import { fetchFinancialHistory } from './quant/fundamental-history';
import { toErrorMessage, runWithConcurrency } from './utils';
import { logger } from './log';

const DEFAULT_CONCURRENCY = 4;

/** 大师分析的 LLM 并发上限：本地 Ollama 单机高并发会排队/OOM，云端 provider 可高并发 */
export function concurrencyForProvider(provider: string): number {
  return provider === 'ollama' ? 2 : 8;
}

export interface DeepAnalysisOptions {
  symbol: string;
  quant: QuantBundle;
  news: StockNews[];
  /** 大师 + 综合（brain 角色）的 chat */
  chat: ChatProvider;
  /** 情绪分析（quick 角色）专用 chat；不传则复用 chat */
  sentimentChat?: ChatProvider;
  selectedMasters?: string[];
  language?: Language;
  /** 大师 LLM 并发上限；不传时用默认值。由 provider 决定，见 concurrencyForProvider */
  concurrency?: number;
  /** 缓存指纹：provider:model 等会影响输出的配置摘要。不传则禁用缓存（测试默认不缓存，避免跨用例污染） */
  cacheFingerprint?: string;
  /** 缓存存储选项（目录/TTL/上限）；测试可注入临时目录 */
  cache?: CacheOptions;
  /** 各大师历史命中率摘要（前端算好经参数注入）；缺省 → 聚合层按默认权重，行为同今天 */
  masterWeights?: MasterWeightInput[];
}

/**
 * 由「所有影响输出的输入」拼缓存 key：股票 + 语言 + 大师集 + provider/model 指纹 + 量化定性信号 + 新闻内容。
 * 量化只取分类信号（composite/technical/fundamental signal + 风险档位），不取数值分——
 * 数值会随盘中价格轻微抖动，纳入会让缓存几乎不命中；定性信号翻转才该重算。
 * 新闻的标题与正文各为独立 key 部件（JSON.stringify 规范化，杜绝边界撞 key）。
 */
function buildCacheKey(
  symbol: string,
  lang: Language,
  masterIds: string[],
  fingerprint: string,
  quant: QuantBundle,
  news: StockNews[],
): string {
  const quantFingerprint = [
    quant.composite.signal,
    quant.technical.signal,
    quant.fundamental.signal,
    quant.risk?.riskLevel ?? '',
    // 大师直接消费 quant.valuation：估值方向/置信度翻转必须 miss（否则命中旧结果即数据污染）
    quant.valuation?.signal ?? '',
    quant.valuation?.confidence ?? '',
  ].join(',');
  // 资金流只有 FUND_FLOW_CONSUMER_IDS 那几位读得到，故仅在选中他们时才参与 key——
  // 否则纯价值派的组合会因日频资金流翻转被无谓击穿缓存，白跑一轮大师 LLM。
  // 取「数据日 + 主力方向」而非元级净额：净额盘中持续抖动，纳入等于给这三位禁用缓存。
  const flowFingerprint =
    quant.fundFlow && masterIds.some((id) => FUND_FLOW_CONSUMER_IDS.has(id))
      ? `${quant.fundFlow.date ?? ''}:${Math.sign(quant.fundFlow.mainNet)}`
      : '';
  const newsParts = news.flatMap((n) => [n.title, n.content ?? '']);
  return cacheKey([
    symbol,
    lang,
    [...masterIds].sort().join(','),
    fingerprint,
    quantFingerprint,
    flowFingerprint,
    ...newsParts,
  ]);
}

export async function runDeepAnalysis(opts: DeepAnalysisOptions): Promise<DeepAnalysisResult> {
  const {
    symbol,
    quant,
    news,
    chat,
    sentimentChat,
    selectedMasters = DEFAULT_MASTER_IDS,
    language,
    concurrency = DEFAULT_CONCURRENCY,
    cacheFingerprint,
    cache,
    masterWeights,
  } = opts;

  let masters = getSelectedMasters(selectedMasters);
  if (masters.length === 0) {
    logger.warn('未找到有效的大师配置，使用默认列表');
    masters = getSelectedMasters(DEFAULT_MASTER_IDS);
  }

  // 缓存命中检查：仅当调用方提供指纹时启用；磁盘缓存跨 Sidecar 进程存活（spawn-per-call 模型下内存缓存无效）
  const key = cacheFingerprint
    ? buildCacheKey(
        symbol,
        language ?? 'zh',
        masters.map((m) => m.meta.id),
        cacheFingerprint,
        quant,
        news,
      )
    : null;
  if (key) {
    const hit = readCache<DeepAnalysisResult>(key, cache);
    if (hit) {
      logger.info(`深度分析缓存命中，跳过 ${masters.length} 次大师 LLM 调用: ${symbol}`);
      return hit;
    }
  }

  // 因子门控：仅当选中的大师里有价值派消费者时才发起 F10 请求（用户只选趋势/宏观派 → 零浪费）
  let factors: MasterFactors | undefined;
  if (masters.some((m) => VALUE_FACTOR_CONSUMER_IDS.has(m.meta.id))) {
    try {
      const history = await fetchFinancialHistory(symbol, FACTOR_HISTORY_PERIODS);
      factors = computeFactors(history);
    } catch (e) {
      // 因子是增强项而非必要输入：拉取/计算失败绝不拖垮深度分析，降级为单期快照
      logger.warn(`因子预计算失败（大师回退单期快照）: ${toErrorMessage(e)}`);
      factors = undefined;
    }
  }

  const ctx: MasterAnalysisContext = { symbol, quant, news, chat, language, factors };

  const masterTasks = masters.map((m: MasterAgent) => () => m.analyze(ctx));
  const [masterResults, sentimentResult] = await Promise.all([
    runWithConcurrency<MasterSignal>(masterTasks, concurrency),
    analyzeSentiment(news, sentimentChat ?? chat, language),
  ]);

  // 权重只微调聚合层，不纳入缓存 key（会随时间缓慢漂移，纳入则几乎不命中）——见蓝图 §4
  const result = await synthesize(
    masterResults,
    sentimentResult,
    quant,
    chat,
    language,
    masterWeights,
  );
  if (key) writeCache(key, result, cache);
  return result;
}
