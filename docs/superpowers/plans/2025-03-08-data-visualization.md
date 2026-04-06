# Data Visualization (Lightweight Charts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a responsive stock price chart using `lightweight-charts` and a sentiment visualization bar using Tailwind CSS, then integrate them into the existing Dashboard.

**Architecture:** 
- `PriceChart`: A wrapper around `lightweight-charts` that handles initialization, data updates, and window resizing using `ResizeObserver`.
- `SentimentBar`: A stateless functional component that renders a bi-colored bar representing bullish vs bearish sentiment.
- `Dashboard`: Updated to include these components in the central and right panels.

**Tech Stack:** React, TypeScript, Tailwind CSS, lightweight-charts.

---

### Task 1: Implement SentimentBar Component

**Files:**
- Create: `src/components/SentimentBar.tsx`

- [ ] **Step 1: Write the SentimentBar component**

```tsx
import React from 'react';

interface SentimentBarProps {
  /** 看涨百分比 (0-100) */
  bullish: number;
}

/**
 * SentimentBar 组件显示看涨与看跌情绪的对比
 */
const SentimentBar: React.FC<SentimentBarProps> = ({ bullish }) => {
  const bearish = 100 - bullish;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-emerald-500">看涨 {bullish}%</span>
        <span className="text-rose-500">看跌 {bearish}%</span>
      </div>
      <div className="h-2 w-full flex rounded-full overflow-hidden bg-gray-800">
        <div 
          className="h-full bg-emerald-500 transition-all duration-500" 
          style={{ width: `${bullish}%` }}
        />
        <div 
          className="h-full bg-rose-500 transition-all duration-500" 
          style={{ width: `${bearish}%` }}
        />
      </div>
    </div>
  );
};

export default SentimentBar;
```

- [ ] **Step 2: Commit SentimentBar**

```bash
git add src/components/SentimentBar.tsx
git commit -m "feat: add SentimentBar component"
```

---

### Task 2: Implement PriceChart Component

**Files:**
- Create: `src/components/PriceChart.tsx`

- [ ] **Step 1: Write the PriceChart component**

```tsx
import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';

interface PriceChartProps {
  /** 股票代码 */
  symbol: string;
}

/**
 * PriceChart 组件使用 lightweight-charts 渲染股价走势图
 */
const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 初始化图表
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    });

    // 添加面积图系列 (Area Series)
    const areaSeries = chart.addAreaSeries({
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.3)',
      bottomColor: 'rgba(16, 185, 129, 0)',
    });

    // 填充 Mock 数据
    const data = [
      { time: '2025-03-01', value: 150.25 },
      { time: '2025-03-02', value: 152.40 },
      { time: '2025-03-03', value: 148.90 },
      { time: '2025-03-04', value: 151.10 },
      { time: '2025-03-05', value: 155.30 },
      { time: '2025-03-06', value: 153.80 },
      { time: '2025-03-07', value: 158.45 },
      { time: '2025-03-08', value: 160.20 },
    ];
    
    // @ts-ignore - time format handling
    areaSeries.setData(data);

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // 响应式处理
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">{symbol} 股价趋势</h3>
        <span className="text-emerald-400 font-mono">+2.45%</span>
      </div>
      <div ref={chartContainerRef} className="w-full h-[400px]" />
    </div>
  );
};

export default PriceChart;
```

- [ ] **Step 2: Commit PriceChart**

```bash
git add src/components/PriceChart.tsx
git commit -m "feat: add PriceChart component"
```

---

### Task 3: Integrate components into Dashboard

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Update Dashboard.tsx with new components**

```tsx
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
            className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </header>

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧栏 (25%) */}
        <aside className="w-1/4 border-r border-white/10 bg-panel p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider">关注列表 (Watchlist)</h2>
          <div className="space-y-2">
            {['AAPL', 'TSLA', 'NVDA', 'MSFT'].map(s => (
              <div key={s} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                <div className="font-bold">{s}</div>
                <div className="text-sm text-gray-400">Technology Sector</div>
              </div>
            ))}
          </div>
        </aside>

        {/* 中间主内容 (50%) */}
        <section className="w-1/2 p-6 overflow-y-auto bg-background/50">
          <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider">分析详情 (Analysis Details)</h2>
          <PriceChart symbol="AAPL" />
          
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="p-4 bg-panel rounded-xl border border-white/10">
              <div className="text-gray-400 text-sm mb-1">成交量</div>
              <div className="text-xl font-bold">12.5M</div>
            </div>
            <div className="p-4 bg-panel rounded-xl border border-white/10">
              <div className="text-gray-400 text-sm mb-1">市值</div>
              <div className="text-xl font-bold">$2.85T</div>
            </div>
          </div>
        </section>

        {/* 右侧分析栏 (25%) */}
        <aside className="w-1/4 border-l border-white/10 bg-panel p-4 overflow-y-auto">
          <div className="mb-8">
            <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider">舆情概览 (Sentiment)</h2>
            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <SentimentBar bullish={65} />
              <p className="mt-3 text-sm text-gray-400 italic">
                "市场情绪偏向乐观，主要受近期财报预期推动。"
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider">AI 洞察 (AI Insights)</h2>
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="p-4 border-l-2 border-emerald-500 bg-white/5">
                  <div className="text-xs text-emerald-500 mb-1 font-bold">多头信号</div>
                  <div className="text-sm">RSI 指标显示超卖，短期可能迎来反弹。</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Final commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: integrate PriceChart and SentimentBar into Dashboard"
```
