import React, { useState } from 'react';
import PriceChart from './PriceChart';
import SentimentBar from './SentimentBar';
import { Settings as SettingsIcon, Search, Loader2, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { startAnalysis } from '../lib/ipc';
import { AnalysisPayload } from '../../sidecar/types';
import { AIAnalysisResult } from '../../sidecar/ai';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 包含顶部的搜索栏和下方的三栏式主内容区
 */
const Dashboard: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [currentSymbol, setCurrentSymbol] = useState('AAPL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 分析结果状态
  const [analysisData, setAnalysisData] = useState<AnalysisPayload | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);

  // 处理搜索
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchSymbol.trim()) return;

    const symbol = searchSymbol.toUpperCase().trim();
    setCurrentSymbol(symbol);
    setIsLoading(true);
    setError(null);

    try {
      // 1. 调用 Sidecar 抓取新闻
      const resultJson = await startAnalysis(symbol);
      const news = JSON.parse(resultJson);
      
      const payload: AnalysisPayload = {
        symbol: symbol,
        news: news
      };
      setAnalysisData(payload);

      // 2. 模拟调用 AI 分析 (在实际项目中这应该是另一个 IPC 调用)
      // 这里进行 Mock 调用以符合任务要求
      const mockAiResult: AIAnalysisResult = {
        rating: Math.floor(Math.random() * 40) + 50, // 50-90 分
        sentiment: Math.random() > 0.6 ? 'bullish' : (Math.random() > 0.3 ? 'neutral' : 'bearish'),
        summary: `基于对 ${symbol} 的最新新闻分析，市场情绪呈现${
          Math.random() > 0.5 ? '积极' : '谨慎'
        }态势。机构投资者正在重新评估其估值模型。`,
        pros: ['技术指标显示超卖', '核心业务增长稳健', '市场占有率提升'],
        cons: ['宏观经济环境不确定性', '竞争加剧', '短期估值压力']
      };
      
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 800));
      setAiResult(mockAiResult);
      
    } catch (err: any) {
      console.error("分析失败:", err);
      setError(err.message || "抓取数据失败，请检查网络或稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white relative">
      {/* 顶部搜索栏 */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-panel shrink-0 z-10">
        <form onSubmit={handleSearch} className="flex items-center w-full max-w-2xl gap-4">
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              placeholder="搜索股票代码 (例如: AAPL, NVDA, TSLA)..."
              className="w-full bg-background border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <button 
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg transition-all flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? '分析中...' : '开始分析'}
          </button>
        </form>
        
        {/* 设置按钮 */}
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 hover:bg-white/5 rounded-full transition-colors group"
          title="系统设置"
        >
          <SettingsIcon className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:rotate-45 transition-all duration-300" />
        </button>
      </header>

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧栏 (25%) - 关注列表 */}
        <aside className="w-1/4 border-r border-white/10 bg-panel p-6 overflow-y-auto hidden md:block">
          <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">关注列表 (Watchlist)</h2>
          <div className="space-y-3">
            {[
              { sym: 'AAPL', name: 'Apple Inc.', price: '160.20', change: '+2.45%' },
              { sym: 'TSLA', name: 'Tesla, Inc.', price: '185.30', change: '-1.20%' },
              { sym: 'NVDA', name: 'NVIDIA Corp.', price: '820.45', change: '+4.12%' },
              { sym: 'MSFT', name: 'Microsoft Corp.', price: '410.15', change: '+0.85%' },
            ].map(item => (
              <div 
                key={item.sym} 
                onClick={() => {
                  setSearchSymbol(item.sym);
                }}
                className={`p-4 rounded-xl border transition-all group cursor-pointer ${
                  currentSymbol === item.sym 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-bold text-lg transition-colors ${
                    currentSymbol === item.sym ? 'text-emerald-400' : 'group-hover:text-emerald-400'
                  }`}>{item.sym}</span>
                  <span className={`text-sm font-mono ${item.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.change}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <span>{item.name}</span>
                  <span className="font-mono text-white">{item.price}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

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
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                正在实时抓取数据...
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
          {analysisData && analysisData.news.length > 0 && (
            <div className="mt-10">
              <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">最新相关新闻</h2>
              <div className="space-y-4">
                {analysisData.news.map((n, i) => (
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
              <SentimentBar bullish={aiResult ? aiResult.rating : 65} />
              
              <div className="mt-6 flex gap-3">
                <div className={`w-1.5 h-auto rounded-full shrink-0 ${
                  !aiResult ? 'bg-emerald-500' : 
                  aiResult.sentiment === 'bullish' ? 'bg-emerald-500' : 
                  aiResult.sentiment === 'bearish' ? 'bg-rose-500' : 'bg-amber-500'
                }`} />
                <p className="text-sm text-gray-300 leading-relaxed italic font-light">
                  "{aiResult ? aiResult.summary : "正在通过 AI 分析市场情绪。请稍候..."}"
                </p>
              </div>
            </div>
          </div>

          {/* AI 洞察区 */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
              {aiResult && (
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  aiResult.sentiment === 'bullish' ? 'bg-emerald-500/20 text-emerald-500' : 
                  aiResult.sentiment === 'bearish' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                }`}>
                  {aiResult.sentiment}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {aiResult ? (
                <>
                  {aiResult.pros.map((pro, i) => (
                    <div key={`pro-${i}`} className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                      <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" />
                        利多因素
                      </div>
                      <div className="text-sm leading-snug">{pro}</div>
                    </div>
                  ))}
                  {aiResult.cons.map((con, i) => (
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
