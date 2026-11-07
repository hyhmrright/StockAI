import { useEffect, useRef, useState } from 'react';
import { saveAnalysisRecord, saveMasterSignals } from '../lib/db';
import type {
  StockInfo,
  StockNews,
  DeepAnalysisResult,
  QuantBundle,
  SaveAnalysisParams,
} from '../../shared/types';
import type { AIAnalysisRecord } from './useAIAnalysis';
import { useSettings } from './useSettings';
interface PersistParams {
  symbol: string;
  stockInfo: StockInfo | null | undefined;
  news: StockNews[];
  record: AIAnalysisRecord | null;
  deepAnalysis: DeepAnalysisResult | null;
  quant: QuantBundle | null;
}
/** 唯一 ID 在 SQLite 侧保证幂等，失败可安全重试，不把失败标记成已保存。 */
export function usePersistAnalysisResults({
  symbol,
  stockInfo,
  news,
  record,
  deepAnalysis,
  quant,
}: PersistParams) {
  const saved = useRef(new Set<string>()),
    pending = useRef(new Set<string>());
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const { settings } = useSettings();
  useEffect(() => {
    const meta = JSON.stringify({
      provider: settings.activeProvider,
      model: settings.providerConfigs[settings.activeProvider]?.model,
      language: settings.language,
      selectedMasters: settings.selectedMasters,
      provenance: quant?.provenance,
      scoreVersion: 'quant-v1',
    });
    const base = {
      symbol,
      stockInfoJson: stockInfo ? JSON.stringify(stockInfo) : undefined,
      newsJson: JSON.stringify(news),
      metadataJson: meta,
    };
    const jobs: { key: string; params: SaveAnalysisParams; signals?: DeepAnalysisResult }[] = [];
    if (record)
      jobs.push({
        key: `ai:${symbol}:${record.analyzedAt}`,
        params: {
          ...base,
          analysisType: 'ai',
          analyzedAt: record.analyzedAt,
          resultJson: JSON.stringify(record.result),
        },
      });
    if (deepAnalysis)
      jobs.push({
        key: `deep:${symbol}:${deepAnalysis.analysisId ?? JSON.stringify(deepAnalysis)}`,
        params: {
          ...base,
          analysisType: 'deep',
          analyzedAt: deepAnalysis.analyzedAt,
          resultJson: JSON.stringify(deepAnalysis),
        },
        signals: deepAnalysis,
      });
    if (quant)
      jobs.push({
        key: `quant:${quant.symbol}:${quant.fetchedAt}`,
        params: {
          ...base,
          analysisType: 'quant',
          analyzedAt: quant.fetchedAt,
          resultJson: JSON.stringify(quant),
        },
      });
    for (const job of jobs) {
      if (saved.current.has(job.key) || pending.current.has(job.key)) continue;
      pending.current.add(job.key);
      void (async () => {
        try {
          for (let attempt = 0; ; attempt++) {
            try {
              await saveAnalysisRecord({ ...job.params, analysisId: job.key });
              if (job.signals)
                await saveMasterSignals(
                  symbol,
                  job.signals.masterSignals,
                  stockInfo?.price,
                  job.key,
                  job.signals.modelFingerprint,
                  job.signals.analyzedAt,
                );
              break;
            } catch (e) {
              if (attempt >= 2) throw e;
              await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
          saved.current.add(job.key);
          if (saved.current.size > 1000) saved.current.delete(saved.current.values().next().value!);
          setFailed(false);
        } catch (e) {
          console.error('保存分析失败', e);
          setFailed(true);
        } finally {
          pending.current.delete(job.key);
        }
      })();
    }
  }, [symbol, stockInfo, news, record, deepAnalysis, quant, retry, settings]);
  return {
    failed,
    retry: () => {
      setFailed(false);
      setRetry((n) => n + 1);
    },
  };
}
