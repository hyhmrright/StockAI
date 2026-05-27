import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import SentimentBar from './SentimentBar';
import StockInfoCard from './StockInfoCard';
import AnalysisTriggerCard from './AnalysisTriggerCard';
import QuantScoreCard from './QuantScoreCard';
import ValuationCard from './ValuationCard';
import RiskCard from './RiskCard';
import DeepAnalysisPanel from './DeepAnalysis/DeepAnalysisPanel';
import BacktestPanel from './Backtest/BacktestPanel';
import AnalysisHistory from './AnalysisHistory';
import { sentimentBgClass, sentimentBadgeClass } from '../lib/signal-styles';
import { useLanguage } from '../hooks/useLanguage';
import type { AIAnalysisRecord } from '../hooks/useAIAnalysis';
import type { StockInfo, QuantBundle, DeepAnalysisResult } from '../../shared/types';

interface AnalysisPanelProps {
  symbol: string;
  stockInfo?: StockInfo;
  record: AIAnalysisRecord | null;
  analyzing: boolean;
  error: string | null;
  hasNews: boolean;
  providerLabel: string;
  modelLabel: string;
  onAnalyze: () => void;
  quant: QuantBundle | null;
  quantLoading: boolean;
  quantError: string | null;
  deepAnalysis: DeepAnalysisResult | null;
  deepAnalyzing: boolean;
  deepError: string | null;
  onDeepAnalyze: () => void;
  masterAnalysisEnabled: boolean;
}

/**
 * 右侧分析面板 — 三态：
 *  1. 未分析：醒目大按钮触发 LLM（默认状态）
 *  2. 分析中：spinner + 模型名
 *  3. 已完成：评分 / sentiment / 利好 / 利空（原 UI）
 */
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  symbol, stockInfo, record, analyzing, error, hasNews, providerLabel, modelLabel, onAnalyze,
  quant, quantLoading, quantError,
  deepAnalysis, deepAnalyzing, deepError, onDeepAnalyze, masterAnalysisEnabled,
}) => {
  const result = record?.result;
  const bgClass = result ? sentimentBgClass(result.sentiment) : '';
  const badgeClass = result ? sentimentBadgeClass(result.sentiment) : '';
  const { t } = useLanguage();

  return (
    <aside className="w-full lg:w-1/4 border-t lg:border-t-0 lg:border-l border-white/10 bg-panel p-6 lg:overflow-y-auto">
      {stockInfo && <StockInfoCard info={stockInfo} />}

      <div className="mb-4 flex justify-end">
        <AnalysisHistory symbol={symbol} />
      </div>

      <QuantScoreCard quant={quant} loading={quantLoading} error={quantError} />

      <ValuationCard valuation={quant?.valuation} loading={quantLoading} />

      <RiskCard risk={quant?.risk} loading={quantLoading} />

      {stockInfo && <BacktestPanel symbol={stockInfo.code} />}

      {/* AI 触发卡片 — 永远显示，状态决定形态 */}
      <div className="mb-10">
        <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">AI 智能分析</h2>
        <AnalysisTriggerCard
          analyzing={analyzing}
          hasNews={hasNews}
          record={record}
          error={error}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onAnalyze={onAnalyze}
        />
      </div>

      {/* 公司概况区 (AI 提取) */}
      {result?.sector && (
        <div className="mb-10">
          <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">公司概况 (Profile)</h2>
          <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-4">
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                {result.sector}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                {result.industry}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{result.description}</p>
          </div>
        </div>
      )}

      {/* 已分析才显示舆情和洞察 */}
      {result && (
        <>
          <div className="mb-10">
            <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">舆情概览 (Sentiment)</h2>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
              <SentimentBar bullish={result.rating} />
              <div className="mt-6 flex gap-3">
                <div className={`w-1.5 h-auto rounded-full shrink-0 ${bgClass}`} />
                <p className="text-sm text-gray-300 leading-relaxed italic font-light">"{result.summary}"</p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeClass}`}>
                {result.sentiment}
              </div>
            </div>
            <div className="space-y-4">
              {result.pros.map((pro, i) => (
                <div key={`pro-${i}`} className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                  <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" />{t('pros')}
                  </div>
                  <div className="text-sm leading-snug">{pro}</div>
                </div>
              ))}
              {result.cons.map((con, i) => (
                <div key={`con-${i}`} className="p-5 border-l-4 border-rose-500 bg-rose-500/5 rounded-r-xl">
                  <div className="text-xs text-rose-500 mb-2 font-bold flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3" />{t('cons')}
                  </div>
                  <div className="text-sm leading-snug">{con}</div>
                </div>
              ))}
            </div>

            {(result.technicalView || result.fundamentalView) && (
              <div className="mt-6 space-y-3">
                {result.technicalView && (
                  <div className="p-4 bg-sky-500/5 border-l-4 border-sky-500 rounded-r-xl">
                    <div className="text-xs text-sky-400 mb-1 font-bold">{t('technical_view')}</div>
                    <div className="text-sm leading-snug">{result.technicalView}</div>
                  </div>
                )}
                {result.fundamentalView && (
                  <div className="p-4 bg-violet-500/5 border-l-4 border-violet-500 rounded-r-xl">
                    <div className="text-xs text-violet-400 mb-1 font-bold">{t('fundamental_view')}</div>
                    <div className="text-sm leading-snug">{result.fundamentalView}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 深度大师分析触发按钮 — 仅在 AI 分析完成且设置中启用后显示 */}
      {record && !deepAnalysis && masterAnalysisEnabled && (
        <div className="mb-6">
          <button
            onClick={onDeepAnalyze}
            disabled={deepAnalyzing}
            className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 transition-colors"
          >
            {deepAnalyzing ? t('deep_analyzing') : t('deep_analysis')}
          </button>
          {deepError && <p className="mt-2 text-xs text-rose-400">{deepError}</p>}
        </div>
      )}

      {deepAnalysis && (
        <div className="mb-10">
          <DeepAnalysisPanel result={deepAnalysis} />
        </div>
      )}
    </aside>
  );
};

export default AnalysisPanel;
