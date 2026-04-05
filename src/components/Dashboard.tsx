import React from 'react';
import PriceChart from './PriceChart';
import SentimentBar from './SentimentBar';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 包含顶部的搜索栏和下方的三栏式主内容区
 */
const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white">
      {/* 顶部搜索栏 */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 bg-panel">
        <div className="flex items-center w-full max-w-2xl">
          <input
            type="text"
            placeholder="搜索股票代码 (例如: AAPL, TSLA)..."
            className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>
      </header>

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧栏 (25%) - 关注列表 */}
        <aside className="w-1/4 border-r border-white/10 bg-panel p-6 overflow-y-auto">
          <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">关注列表 (Watchlist)</h2>
          <div className="space-y-3">
            {[
              { sym: 'AAPL', name: 'Apple Inc.', price: '160.20', change: '+2.45%' },
              { sym: 'TSLA', name: 'Tesla, Inc.', price: '185.30', change: '-1.20%' },
              { sym: 'NVDA', name: 'NVIDIA Corp.', price: '820.45', change: '+4.12%' },
              { sym: 'MSFT', name: 'Microsoft Corp.', price: '410.15', change: '+0.85%' },
            ].map(item => (
              <div key={item.sym} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 cursor-pointer transition-all group">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-lg group-hover:text-emerald-400 transition-colors">{item.sym}</span>
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
        <section className="w-1/2 p-8 overflow-y-auto bg-background/50 scrollbar-hide">
          <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">分析详情 (Analysis Details)</h2>
          
          {/* 注入 PriceChart 组件 */}
          <PriceChart symbol="AAPL" />
          
          {/* 指标展示区 */}
          <div className="mt-8 grid grid-cols-2 gap-6">
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
        </section>

        {/* 右侧分析栏 (25%) - 舆情与 AI 洞察 */}
        <aside className="w-1/4 border-l border-white/10 bg-panel p-6 overflow-y-auto">
          {/* 舆情概览区 */}
          <div className="mb-10">
            <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">舆情概览 (Sentiment)</h2>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
              {/* 注入 SentimentBar 组件 */}
              <SentimentBar bullish={65} />
              
              <div className="mt-6 flex gap-3">
                <div className="w-1.5 h-auto bg-emerald-500 rounded-full shrink-0" />
                <p className="text-sm text-gray-300 leading-relaxed italic font-light">
                  "市场整体情绪偏向乐观，分析师普遍上调了下季度的盈利预期。社交媒体上的讨论热度主要集中在 AI 业务的增长潜力上。"
                </p>
              </div>
            </div>
          </div>

          {/* AI 洞察区 */}
          <div>
            <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">AI 实时洞察 (AI Insights)</h2>
            <div className="space-y-4">
              <div className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  看多信号
                </div>
                <div className="text-sm leading-snug">RSI 指标目前处于 35，显示严重超卖，短期技术性反弹概率极大。</div>
              </div>
              
              <div className="p-5 border-l-4 border-amber-500 bg-amber-500/5 rounded-r-xl">
                <div className="text-xs text-amber-500 mb-2 font-bold">中性信号</div>
                <div className="text-sm leading-snug">机构持仓在过去 48 小时内保持稳定，未见明显的大宗减持行为。</div>
              </div>

              <div className="p-5 border-l-4 border-emerald-500 bg-emerald-500/5 rounded-r-xl">
                <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  看多信号
                </div>
                <div className="text-sm leading-snug">MACD 线即将发生金叉，趋势扭转信号初现。</div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Dashboard;
