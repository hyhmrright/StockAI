import { useCallback, useEffect, useState } from 'react';
import type { StockInfo, StockNews, QuantBundle, DeepAnalysisResult } from '../../shared/types';
import { useStockData } from './useStockData';
import { useQuantData } from './useQuantData';
import { useAIAnalysis, type AIAnalysisRecord } from './useAIAnalysis';
import { useDeepAnalysis } from './useDeepAnalysis';
import { useMasterWeights } from './useMasterWeights';
import { useReportIndexWarmup } from './useReportIndexWarmup';
import { PROVIDER_PROFILES, useSettings } from './useSettings';
import type { AsyncStep } from './useSymbolFetch';

/** 一次分析的触发器与状态（AI 基础分析 / 深度大师分析同形） */
interface AnalysisTrack<T> {
  result: T | null;
  running: boolean;
  error: string | null;
  /** 零参触发：所需的 news / quant / weights 已由 suite 绑定 */
  run: () => void;
}

export interface AnalysisSuite {
  step: AsyncStep;
  stockInfo?: StockInfo;
  news: StockNews[];
  dataError: string | null;
  quant: QuantBundle | null;
  quantLoading: boolean;
  quantError: string | null;
  ai: AnalysisTrack<AIAnalysisRecord>;
  deep: AnalysisTrack<DeepAnalysisResult>;
  /** 当前生效的 provider / model 展示名 */
  providerLabel: string;
  modelLabel: string;
  masterAnalysisEnabled: boolean;
}

/**
 * 一只股票的完整分析套件——把「抓数据 / 量化 / AI 分析 / 深度分析 / 大师权重 / RAG 预热」
 * 这组彼此耦合的 hook 收成一个对象。
 *
 * 为什么要有它：这些 hook 的输出此前由 Dashboard 逐个解构再当作 20 个 prop 转发给面板，
 * 面板内部任何状态变化都要穿过 Dashboard。收敛后 Dashboard 只传一个 suite，
 * 组合根回到「只管布局与路由」的职责。
 */
export function useAnalysisSuite(symbol: string): AnalysisSuite {
  const { settings } = useSettings();
  const { step, stockInfo, news, error: dataError } = useStockData(symbol);
  const { step: quantStep, quant, error: quantError } = useQuantData(symbol);

  // 财报 RAG 预热：把交易所互动平台抓取挪出 chat 首答关键路径（fire-and-forget）
  useReportIndexWarmup(symbol);

  // 用户未为该 provider 配过 model 时回退到 PROVIDER_PROFILES 的默认模型
  const modelLabel =
    settings.providerConfigs[settings.activeProvider]?.model ??
    PROVIDER_PROFILES[settings.activeProvider].model;

  // 深度分析缓存指纹：provider/model/大师/语言任一变化即失效，避免显示陈旧结果
  const deepFingerprint = `${settings.activeProvider}:${modelLabel}:${settings.selectedMasters.join(',')}:${settings.language}`;

  const ai = useAIAnalysis(symbol);
  const deep = useDeepAnalysis(symbol, deepFingerprint);

  // 大师动态权重快照（全局 · best-effort）：命中率好的大师在综合层获更大话语权。
  // 没算好/空历史时为 []，退化默认权重，绝不阻塞分析。
  const { weights: masterWeights, refetch: refetchMasterWeights } = useMasterWeights();

  // 新深度分析落账后刷新权重快照供下次分析用；最终一致即可，无需与写库严格同步
  useEffect(() => {
    if (deep.result) refetchMasterWeights();
  }, [deep.result, refetchMasterWeights]);

  const runAi = useCallback(() => {
    void ai.analyze(news, quant ?? undefined);
  }, [ai, news, quant]);

  const runDeep = useCallback(() => {
    void deep.analyze(news, quant ?? undefined, masterWeights);
  }, [deep, news, quant, masterWeights]);

  useAutoAnalyze({
    enabled: settings.autoAnalyze,
    symbol,
    ready: step === 'ready' && news.length > 0,
    quantSettled: quantStep === 'ready' || quantStep === 'error',
    run: runAi,
  });

  return {
    step,
    stockInfo,
    news,
    dataError,
    quant,
    quantLoading: quantStep === 'fetching',
    quantError,
    ai: { result: ai.record, running: ai.analyzing, error: ai.error, run: runAi },
    deep: { result: deep.result, running: deep.analyzing, error: deep.error, run: runDeep },
    providerLabel: settings.activeProvider,
    modelLabel,
    masterAnalysisEnabled: settings.masterAnalysis,
  };
}

/** 自动模式：新闻 + 量化均就绪后，对每个 symbol 只自动触发一次 LLM（重度用户专用，默认关） */
function useAutoAnalyze(opts: {
  enabled: boolean;
  symbol: string;
  ready: boolean;
  quantSettled: boolean;
  run: () => void;
}): void {
  const { enabled, symbol, ready, quantSettled, run } = opts;
  const [autoFlowSymbol, setAutoFlowSymbol] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !ready || !quantSettled) return;
    if (autoFlowSymbol === symbol) return;
    setAutoFlowSymbol(symbol);
    run();
  }, [enabled, ready, quantSettled, symbol, autoFlowSymbol, run]);
}
