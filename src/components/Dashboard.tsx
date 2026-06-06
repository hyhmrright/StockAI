import React, { useEffect, useMemo, useState } from 'react';
import PriceChart from './PriceChart';
import { Loader2, AlertCircle } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { useStockData } from '../hooks/useStockData';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { useQuantData } from '../hooks/useQuantData';
import { useDeepAnalysis } from '../hooks/useDeepAnalysis';
import { useChat } from '../hooks/useChat';
import { useSettings, PROVIDER_PROFILES } from '../hooks/useSettings';
import { DEFAULT_WATCHLIST } from '../hooks/useWatchlist';
import { usePersistAnalysisResults } from '../hooks/usePersistAnalysisResults';
import { useLanguage } from '../hooks/useLanguage';
import Watchlist from './Watchlist';
import SearchHeader from './SearchHeader';
import AnalysisPanel from './AnalysisPanel';
import ChatPanel from './ChatPanel';
import type { ChatContext } from '../../shared/types';

/**
 * Dashboard 组件实现了主仪表盘布局
 *
 * 数据流（v0.7 新交互）：
 *  1. 切换 symbol → useStockData 自动抓 StockInfo + News（不调 LLM）
 *  2. 用户点 AnalysisPanel 的 "开始 AI 分析" 按钮 → useAIAnalysis 调 LLM
 *  3. settings.autoAnalyze 为 true 时，News 抓到后会自动触发一次 LLM（重度用户专用，默认关）
 */
const Dashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState(DEFAULT_WATCHLIST[0].sym);
  const [autoFlowSymbol, setAutoFlowSymbol] = useState<string | null>(null);

  const { step, stockInfo, news, error: dataError } = useStockData(currentSymbol);
  const { record, analyzing, error: aiError, analyze } = useAIAnalysis(currentSymbol);
  const { step: quantStep, quant, error: quantError } = useQuantData(currentSymbol);
  const { settings } = useSettings();
  const { t } = useLanguage();

  const providerProfile = PROVIDER_PROFILES[settings.activeProvider];
  const providerLabel = settings.activeProvider;
  const modelLabel = settings.providerConfigs[settings.activeProvider]?.model ?? providerProfile.model;

  // 深度分析缓存指纹：provider/model/大师/语言任一变化即失效，避免显示陈旧结果
  const deepFingerprint = `${settings.activeProvider}:${modelLabel}:${settings.selectedMasters.join(',')}:${settings.language}`;
  const { result: deepAnalysis, analyzing: deepAnalyzing, error: deepError, analyze: analyzeDeep } = useDeepAnalysis(currentSymbol, deepFingerprint);

  // 追问上下文：从已抓新闻/量化/已有分析精简，作为对话事实底座（不重复抓取）
  const chatContext = useMemo<ChatContext>(() => ({
    newsTitles: news.slice(0, 8).map(n => n.title),
    quantSummary: quant ? `综合 ${quant.composite.score}/100（${quant.composite.signal}）` : undefined,
    analysisSummary: record?.result?.summary ?? deepAnalysis?.synthesis.summary,
  }), [news, quant, record, deepAnalysis]);
  const { messages: chatMessages, sending: chatSending, error: chatError, ask: chatAsk, reset: chatReset } = useChat(currentSymbol, chatContext);

  // 自动模式：新闻 + 量化数据均就绪后触发一次 LLM
  useEffect(() => {
    if (!settings.autoAnalyze) return;
    if (step !== 'ready' || news.length === 0) return;
    if (quantStep !== 'ready' && quantStep !== 'error') return;
    if (autoFlowSymbol === currentSymbol) return;
    setAutoFlowSymbol(currentSymbol);
    analyze(news, quant ?? undefined);
  }, [step, news, currentSymbol, settings.autoAnalyze, autoFlowSymbol, analyze, quant, quantStep]);

  // 分析结果自动持久化（AI/深度/量化存历史 + 落账大师 signal），逻辑抽至 hook 以收敛组件行数
  usePersistAnalysisResults({ symbol: currentSymbol, stockInfo, news, record, deepAnalysis, quant });

  function handleSearch(symbol: string) {
    setCurrentSymbol(symbol);
  }

  function handleWatchlistSelect(sym: string) {
    setCurrentSymbol(sym);
  }

  const loading = step === 'fetching';
  const busy = loading || analyzing;
  const stepLabel = loading ? t('fetching_data') : analyzing ? t('ai_analyzing') : '';

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white relative">
      <SearchHeader
        onSearch={handleSearch}
        loading={busy}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stepLabel={stepLabel}
      />

      {/* 小屏纵向排列并整体滚动；lg 以上横向排列各区域独立滚动 */}
      <main className="flex flex-1 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <Watchlist
          currentSymbol={currentSymbol}
          onSelect={handleWatchlistSelect}
        />

        <section className="flex-1 md:w-1/2 p-8 lg:overflow-y-auto bg-background/50 scrollbar-hide relative">
          {dataError && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-bold">{t('data_fetch_error')}</div>
                <div className="text-sm opacity-90">{dataError}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t('analysis_details', { symbol: currentSymbol })}</h2>
            {busy && (
              <div className="flex items-center gap-3 text-xs text-emerald-500 font-medium bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/20 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {stepLabel}
              </div>
            )}
          </div>

          <PriceChart symbol={currentSymbol} />

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">{t('latest_price')}</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {stockInfo?.price?.toFixed(2) || t('no_data')}
                <span className="text-sm ml-2 text-gray-500">{stockInfo?.currency}</span>
              </div>
            </div>
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">{t('price_change')}</div>
              <div className={`text-2xl font-mono font-bold ${(stockInfo?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(stockInfo?.changePercent ?? 0) >= 0 ? '+' : ''}
                {stockInfo?.changePercent?.toFixed(2) || '0.00'}%
              </div>
            </div>
          </div>

          {news.length > 0 && (
            <div className="mt-10">
              <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">{t('latest_news')}</h2>
              <div className="space-y-4">
                {news.map((n, i) => (
                  <a
                    key={i}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-5 bg-panel rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="text-xs text-emerald-500 mb-2 font-mono flex justify-between">
                      <span>{n.source}</span>
                      <span className="text-gray-500">{n.date}</span>
                    </div>
                    <div className="text-base font-bold group-hover:text-emerald-400 transition-colors">{n.title}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        <AnalysisPanel
          symbol={currentSymbol}
          stockInfo={stockInfo}
          record={record}
          analyzing={analyzing}
          error={aiError}
          hasNews={news.length > 0}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onAnalyze={() => analyze(news, quant ?? undefined)}
          quant={quant}
          quantLoading={quantStep === 'fetching'}
          quantError={quantError}
          deepAnalysis={deepAnalysis}
          deepAnalyzing={deepAnalyzing}
          deepError={deepError}
          onDeepAnalyze={() => analyzeDeep(news, quant ?? undefined)}
          masterAnalysisEnabled={settings.masterAnalysis}
          chatSlot={
            <ChatPanel
              messages={chatMessages}
              sending={chatSending}
              error={chatError}
              disabled={news.length === 0}
              onAsk={chatAsk}
              onReset={chatReset}
            />
          }
        />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
