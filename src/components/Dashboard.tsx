import React, { useState } from 'react';
import PriceChart from './PriceChart';
import SentimentBar from './SentimentBar';
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { useAnalysis } from '../hooks/useAnalysis';
import Watchlist from './Watchlist';
import SearchHeader from './SearchHeader';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 它是应用的核心容器，协调子组件并管理分析状态
 */
const Dashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState('AAPL');
  
  // 使用封装好的分析 Hook
  const { step, loading, error, result, performAnalysis } = useAnalysis();

  // 获取当前步骤的描述文字
  const getStepLabel = () => {
    switch (step) {
      case 'scraping': return '正在抓取实时新闻...';
      case 'extracting': return '正在提取新闻正文...';
      case 'analyzing': return 'AI 正在深度分析市场情绪...';
      default: return '正在实时分析数据...';
    }
  };

  // 处理搜索
  const handleSearch = (symbol: string) => {
    setCurrentSymbol(symbol);
    performAnalysis(symbol);
  };

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
          onSelect={handleSearch}
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
          
          {/* 指标展示区 */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">成交量 (Volume)</div>
              <div className="text-2xl font-mono font-bold">12,548,932</div>
              <div className="mt-2 text-xs text-emerald-400 font-medium">高于平均水平 15%</div>
            </div>
            <div className="p-6 bg-panel rounded-2xl border border-white/10 shadow-lg">
              <div className="text-gray-400 text-xs font-bold uppercase mb-2 tracking-wider">市值 (Market Cap)</div>
              <div className="text-2xl font-mono font-bold">$2.85T</div>
              <div className="mt-2 text-xs text-gray-500">全球排名 #1</div>
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
        <aside className="w-1/4 border-l border-white/10 bg-panel p-6 overflow-y-auto hidden lg:block">
          {/* 舆情概览区 */}
          <div className="mb-10">
            <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">舆情概览 (Sentiment)</h2>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
              {/* 注入 SentimentBar 组件 */}
              <SentimentBar bullish={result ? result.analysis.rating : 65} />
              
              <div className="mt-6 flex gap-3">
                <div className={`w-1.5 h-auto rounded-full shrink-0 ${
                  !result ? 'bg-emerald-500' : 
                  result.analysis.sentiment === 'bullish' ? 'bg-emerald-500' : 
                  result.analysis.sentiment === 'bearish' ? 'bg-rose-500' : 'bg-amber-500'
                }`} />
                <p className="text-sm text-gray-300 leading-relaxed italic font-light">
                  "{result ? result.analysis.summary : "正在通过 AI 分析市场情绪。请稍候..."}"
                </p>
              </div>
            </div>
          </div>

          {/* AI 洞察区 */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
              {result && (
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  result.analysis.sentiment === 'bullish' ? 'bg-emerald-500/20 text-emerald-500' : 
                  result.analysis.sentiment === 'bearish' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                }`}>
                  {result.analysis.sentiment}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {result ? (
                <>
                  {result.analysis.pros.map((pro, i) => (
                    <div key={`pro-${i}`} className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                      <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" />
                        利多因素
                      </div>
                      <div className="text-sm leading-snug">{pro}</div>
                    </div>
                  ))}
                  {result.analysis.cons.map((con, i) => (
                    <div key={`con-${i}`} className="p-5 border-l-4 border-rose-500 bg-rose-500/5 rounded-r-xl">
                      <div className="text-xs text-rose-500 mb-2 font-bold flex items-center gap-1.5">
                        <TrendingDown className="w-3 h-3" />
                        风险提示
                      </div>
                      <div className="text-sm leading-snug">{con}</div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-10 opacity-50 space-y-4">
                  <div className="flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500/30" />
                  </div>
                  <div className="text-xs">等待分析数据...</div>
                </div>
              )}
            </div>
          </div>
        </aside>
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
