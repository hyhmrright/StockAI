import { useEffect, useMemo, useRef } from "react";
import { saveAnalysisRecord, saveMasterSignals } from "../lib/db";
import type { StockInfo, StockNews, DeepAnalysisResult, QuantBundle } from "../../shared/types";
import type { AIAnalysisRecord } from "./useAIAnalysis";

interface PersistParams {
  symbol: string;
  stockInfo: StockInfo | null | undefined;
  news: StockNews[];
  record: AIAnalysisRecord | null;
  deepAnalysis: DeepAnalysisResult | null;
  quant: QuantBundle | null;
}

/**
 * 分析结果自动持久化：AI / 深度 / 量化分析完成时 fire-and-forget 存入历史库，
 * 深度分析额外落账各大师 signal + 当时价（供虚拟大师组合前向跟踪）。
 * 用 savedKeys 按结果指纹去重，避免重复落账同一结果。
 * 从 Dashboard 抽出以收敛组件行数（infoJson 随 stockInfo 变化而更新，故各 effect 依赖 infoJson 即可拿到新鲜 price）。
 */
export function usePersistAnalysisResults({ symbol, stockInfo, news, record, deepAnalysis, quant }: PersistParams): void {
  const savedKeys = useRef<Record<string, string>>({});
  const infoJson = useMemo(() => (stockInfo ? JSON.stringify(stockInfo) : undefined), [stockInfo]);
  const newsJsonStr = useMemo(() => (news.length > 0 ? JSON.stringify(news) : undefined), [news]);

  useEffect(() => {
    if (!record) return;
    const key = String(record.analyzedAt);
    if (savedKeys.current.ai === key) return;
    savedKeys.current.ai = key;
    saveAnalysisRecord({
      symbol, analysisType: 'ai',
      resultJson: JSON.stringify(record.result), stockInfoJson: infoJson, newsJson: newsJsonStr,
    }).catch(e => console.error("保存 AI 分析历史失败:", e));
  }, [record, symbol, infoJson, newsJsonStr]);

  useEffect(() => {
    if (!deepAnalysis) return;
    const key = `${symbol}:${deepAnalysis.synthesis.confidence}:${deepAnalysis.synthesis.signal}`;
    if (savedKeys.current.deep === key) return;
    savedKeys.current.deep = key;
    saveAnalysisRecord({
      symbol, analysisType: 'deep',
      resultJson: JSON.stringify(deepAnalysis), stockInfoJson: infoJson, newsJson: newsJsonStr,
    }).catch(e => console.error("保存深度分析历史失败:", e));
    // 落账各大师 signal + 当时价，供虚拟大师组合前向跟踪（命中率/净值统计用）；入场价缺失会判「待定」
    saveMasterSignals(symbol, deepAnalysis.masterSignals, stockInfo?.price)
      .catch(e => console.error("保存大师 signal 失败:", e));
  }, [deepAnalysis, symbol, infoJson, newsJsonStr, stockInfo]);

  useEffect(() => {
    if (!quant) return;
    const key = `${quant.symbol}:${quant.fetchedAt}`;
    if (savedKeys.current.quant === key) return;
    savedKeys.current.quant = key;
    saveAnalysisRecord({
      symbol, analysisType: 'quant',
      resultJson: JSON.stringify(quant), stockInfoJson: infoJson,
    }).catch(e => console.error("保存量化分析历史失败:", e));
  }, [quant, symbol, infoJson]);
}
