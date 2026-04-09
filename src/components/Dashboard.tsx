import React, { useState } from 'react';
import PriceChart from './PriceChart';
import { Loader2, AlertCircle } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { useAnalysis } from '../hooks/useAnalysis';
import { useSettings } from '../hooks/useSettings';
import { DEFAULT_WATCHLIST } from '../hooks/useWatchlist';
import Watchlist from './Watchlist';
import SearchHeader from './SearchHeader';
import AnalysisPanel from './AnalysisPanel';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 它是应用的核心容器，协调子组件并管理分析状态
 */
const Dashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState(DEFAULT_WATCHLIST[0].sym);
  
  // 使用封装好的分析 Hook
  const { step, loading, error, result, performAnalysis } = useAnalysis();
  const { settings } = useSettings();

  // 获取当前步骤的描述文字
  function getStepLabel(): string {
    switch (step) {
      case 'scraping': return '正在抓取实时新闻...';
      case 'extracting': return '正在提取新闻正文...';
      case 'analyzing': return 'AI 正在深度分析市场情绪...';
      default: return '正在实时分析数据...';
    }
  }

  // 处理搜索栏提交
  function handleSearch(symbol: string) {
    setCurrentSymbol(symbol);
    performAnalysis(symbol);
  }

  // 处理关注列表点击（受 autoAnalyze 设置控制）
  function handleWatchlistSelect(sym: string) {
    setCurrentSymbol(sym);
    if (settings.autoAnalyze) performAnalysis(sym);
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white relative">
      {/* 顶部搜索栏组件 */}
      <SearchHeader 
        onSearch={handleSearch}
        loading={loading}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stepLabel={getStepLabel()}
      />

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧关注列表组件 */}
        <Watchlist
          currentSymbol={currentSymbol}
          onSelect={handleWatchlistSelect}
        />

        {/* 中间主内容 (50%) - 图表与核心详情 */}
        <section className="flex-1 md:w-1/2 p-8 overflow-y-auto bg-background/50 scrollbar-hide relative">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-bold">分析出错</div>
                <div className="text-sm opacity-90">{error}</div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">分析详情 ({currentSymbol})</h2>
            {loading && (
              <div className="flex items-center gap-3 text-xs text-emerald-500 font-medium bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/20 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {getStepLabel()}
              </div>
            )}
          </div>
          
          {/* 注入 PriceChart 组件 */}
          <PriceChart symbol={currentSymbol} />
          
          {/* 指标展示区（待接入行情数据源） */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">成交量 (Volume)</div>
              <div className="text-2xl font-mono font-bold text-gray-500">暂无数据</div>
            </div>
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">市值 (Market Cap)</div>
              <div className="text-2xl font-mono font-bold text-gray-500">暂无数据</div>
            </div>
          </div>

          {/* 新闻列表 (抓取到的真实数据) */}
          {result && result.news.length > 0 && (
            <div className="mt-10">
              <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">最新相关新闻</h2>
              <div className="space-y-4">
                {result.news.map((n, i) => (
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

        {/* 右侧分析栏 (25%) - 舆情与 AI 洞察 */}
        <AnalysisPanel result={result} />
      </main>

      {/* 设置模态框 */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default Dashboard;
