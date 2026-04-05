import React from 'react';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 包含顶部的搜索栏和下方的三栏式主内容区
 */
const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen bg-background">
      {/* 顶部搜索栏 */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 bg-panel">
        <div className="flex items-center w-full max-w-2xl">
          <input
            type="text"
            placeholder="搜索股票代码 (例如: AAPL, TSLA)..."
            className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </header>

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧栏 (25%) */}
        <aside className="w-1/4 border-r border-white/10 bg-panel p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">关注列表 (Watchlist)</h2>
          {/* 这里预留给列表内容 */}
        </aside>

        {/* 中间主内容 (50%) */}
        <section className="w-1/2 p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">股票图表与详情 (Chart & Details)</h2>
          {/* 这里预留给图表内容 */}
        </section>

        {/* 右侧分析栏 (25%) */}
        <aside className="w-1/4 border-l border-white/10 bg-panel p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">AI 分析与新闻 (AI Analysis & News)</h2>
          {/* 这里预留给分析内容 */}
        </aside>
      </main>
    </div>
  );
};

export default Dashboard;
