import React, { useEffect, useState } from 'react';
import PriceChart from './PriceChart';
import { Loader2, AlertCircle } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { useStockData } from '../hooks/useStockData';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { useSettings, PROVIDER_PROFILES } from '../hooks/useSettings';
import { DEFAULT_WATCHLIST } from '../hooks/useWatchlist';
import Watchlist from './Watchlist';
import SearchHeader from './SearchHeader';
import AnalysisPanel from './AnalysisPanel';
import StockInfoCard from './StockInfoCard';

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
  const { settings } = useSettings();

  const providerProfile = PROVIDER_PROFILES[settings.activeProvider];
  const providerLabel = settings.activeProvider;
  const modelLabel = settings.providerConfigs[settings.activeProvider]?.model ?? providerProfile.model;

  // 自动模式：数据就绪后触发一次 LLM；用 autoFlowSymbol 防止重复触发
  useEffect(() => {
    if (!settings.autoAnalyze) return;
    if (step !== 'ready' || news.length === 0) return;
    if (autoFlowSymbol === currentSymbol) return;
    setAutoFlowSymbol(currentSymbol);
    analyze(news);
  }, [step, news, currentSymbol, settings.autoAnalyze, autoFlowSymbol, analyze]);

  function handleSearch(symbol: string) {
    setCurrentSymbol(symbol);
  }

  function handleWatchlistSelect(sym: string) {
    setCurrentSymbol(sym);
  }

  const loading = step === 'fetching';
  const busy = loading || analyzing;
  const stepLabel = loading ? '正在抓取实时数据…' : analyzing ? 'AI 正在分析…' : '';

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white relative">
      <SearchHeader
        onSearch={handleSearch}
        loading={busy}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stepLabel={stepLabel}
      />

      <main className="flex flex-1 overflow-hidden">
        <Watchlist
          currentSymbol={currentSymbol}
          onSelect={handleWatchlistSelect}
        />

        <section className="flex-1 md:w-1/2 p-8 overflow-y-auto bg-background/50 scrollbar-hide relative">
          {dataError && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-bold">数据抓取出错</div>
                <div className="text-sm opacity-90">{dataError}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">分析详情 ({currentSymbol})</h2>
            {busy && (
              <div className="flex items-center gap-3 text-xs text-emerald-500 font-medium bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/20 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {stepLabel}
              </div>
            )}
          </div>

          {stockInfo && <StockInfoCard info={stockInfo} />}

          <PriceChart symbol={currentSymbol} />

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">最新价格 (Price)</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {stockInfo?.price?.toFixed(2) || '暂无数据'}
                <span className="text-sm ml-2 text-gray-500">{stockInfo?.currency}</span>
              </div>
            </div>
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">涨跌幅 (Change)</div>
              <div className={`text-2xl font-mono font-bold ${(stockInfo?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(stockInfo?.changePercent ?? 0) >= 0 ? '+' : ''}
                {stockInfo?.changePercent?.toFixed(2) || '0.00'}%
              </div>
            </div>
          </div>

          {news.length > 0 && (
            <div className="mt-10">
              <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">最新相关新闻</h2>
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
          stockInfo={stockInfo}
          record={record}
          analyzing={analyzing}
          error={aiError}
          hasNews={news.length > 0}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onAnalyze={() => analyze(news)}
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
