import React, { useEffect, useMemo, useState } from 'react';
import PriceChart from './PriceChart';
import { Loader2, AlertCircle } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { useAnalysisSuite } from '../hooks/useAnalysisSuite';
import { useChat } from '../hooks/useChat';
import { DEFAULT_WATCHLIST } from '../hooks/useWatchlist';
import { usePersistAnalysisResults } from '../hooks/usePersistAnalysisResults';
import { useLanguage } from '../hooks/useLanguage';
import { useSettings } from '../hooks/useSettings';
import OnboardingGuide from './OnboardingGuide';
import Watchlist from './Watchlist';
import SearchHeader from './SearchHeader';
import NlScreenerModal from './Screener/NlScreenerModal';
import PortfolioModal from './Portfolio/PortfolioModal';
import AnalysisPanel from './AnalysisPanel';
import ChatPanel from './ChatPanel';
import PriceSummaryCards from './PriceSummaryCards';
import NewsList from './NewsList';
import type { ChatContext, BacktestResult } from '../../shared/types';

/**
 * Dashboard 组件实现了主仪表盘布局
 *
 * 数据流（v0.7 新交互）：
 *  1. 切换 symbol → useAnalysisSuite 自动抓 StockInfo + News + 量化（不调 LLM）
 *  2. 用户点 AnalysisPanel 的 "开始 AI 分析" 按钮 → suite.ai.run() 调 LLM
 *  3. settings.autoAnalyze 为 true 时，数据就绪后会自动触发一次（重度用户专用，默认关）
 *
 * 本组件只管布局与标的路由；分析状态全部由 useAnalysisSuite 持有。
 */
const Dashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScreenerOpen, setIsScreenerOpen] = useState(false);
  // 持仓弹窗按需挂载：usePortfolio 会拉 SQLite 并轮询报价，不开就不该跑
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  // 引导只在本次运行内可关：不落盘「已看过」，因为真正的退出条件是保存一次配置——
  // 保存后 needsSetup 会经 useSettings 单例回落，引导自行消失。
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState(DEFAULT_WATCHLIST[0].sym);
  // 回测结果提升到此：BacktestPanel（右列）跑出，PriceChart（中列）叠加买卖点/净值曲线共用
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);

  const suite = useAnalysisSuite(currentSymbol);
  const { step, stockInfo, news, dataError, quant } = suite;
  const { t } = useLanguage();
  const { needsSetup } = useSettings();

  // 追问上下文：从已抓新闻/量化/已有分析精简，作为对话事实底座（不重复抓取）
  const chatContext = useMemo<ChatContext>(
    () => ({
      newsTitles: news.slice(0, 8).map((n) => n.title),
      quantSummary: quant
        ? `综合 ${quant.composite.score}/100（${quant.composite.signal}）`
        : undefined,
      analysisSummary: suite.ai.result?.result?.summary ?? suite.deep.result?.synthesis.summary,
    }),
    [news, quant, suite.ai.result, suite.deep.result],
  );
  const {
    messages: chatMessages,
    sending: chatSending,
    error: chatError,
    ask: chatAsk,
    reset: chatReset,
  } = useChat(currentSymbol, chatContext);

  // 切换 symbol 时清空回测结果，避免旧标的的买卖点/净值曲线残留在新标的图上
  useEffect(() => {
    setBacktest(null);
  }, [currentSymbol]);

  // 分析结果自动持久化（AI/深度/量化存历史 + 落账大师 signal）
  usePersistAnalysisResults({
    symbol: currentSymbol,
    stockInfo,
    news,
    record: suite.ai.result,
    deepAnalysis: suite.deep.result,
    quant,
  });

  const loading = step === 'fetching';
  const busy = loading || suite.ai.running;
  const stepLabel = loading ? t('fetching_data') : suite.ai.running ? t('ai_analyzing') : '';

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white relative">
      <SearchHeader
        onSearch={setCurrentSymbol}
        loading={busy}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScreener={() => setIsScreenerOpen(true)}
        onOpenPortfolio={() => setIsPortfolioOpen(true)}
        stepLabel={stepLabel}
      />

      {/* 小屏纵向排列并整体滚动；lg 以上横向排列各区域独立滚动 */}
      <main className="flex flex-1 flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <Watchlist currentSymbol={currentSymbol} onSelect={setCurrentSymbol} />

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
            <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">
              {t('analysis_details', { symbol: currentSymbol })}
            </h2>
            {busy && (
              <div className="flex items-center gap-3 text-xs text-emerald-500 font-medium bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/20 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {stepLabel}
              </div>
            )}
          </div>

          <PriceChart
            symbol={currentSymbol}
            levels={quant?.levels}
            backtestTrades={backtest?.trades}
            equityCurve={backtest?.equityCurve}
          />

          <PriceSummaryCards stockInfo={stockInfo} />

          <NewsList news={news} />
        </section>

        <AnalysisPanel
          symbol={currentSymbol}
          suite={suite}
          backtest={backtest}
          onBacktestResult={setBacktest}
          chatSlot={
            <ChatPanel
              messages={chatMessages}
              sending={chatSending}
              error={chatError}
              disabled={news.length === 0}
              newsRef={news}
              onAsk={chatAsk}
              onReset={chatReset}
            />
          }
        />
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* 首启引导：从未保存过配置时挡在最前，指路到设置面板 */}
      <OnboardingGuide
        isOpen={needsSetup && !guideDismissed}
        onConfigure={() => {
          setGuideDismissed(true);
          setIsSettingsOpen(true);
        }}
        onDismiss={() => setGuideDismissed(true)}
      />

      {/* 智能选股模态：选中结果行 → 切到该股票的常规分析流（模态内部自行关闭） */}
      <NlScreenerModal
        isOpen={isScreenerOpen}
        onClose={() => setIsScreenerOpen(false)}
        onSelect={setCurrentSymbol}
      />

      {/* 我的持仓：只在打开时挂载，避免不看持仓也在轮询报价 */}
      {isPortfolioOpen && (
        <PortfolioModal onClose={() => setIsPortfolioOpen(false)} onSelect={setCurrentSymbol} />
      )}
    </div>
  );
};

export default Dashboard;
