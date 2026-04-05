import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries } from 'lightweight-charts';

interface PriceChartProps {
  /** 股票代码 */
  symbol: string;
}

/**
 * PriceChart 组件使用 lightweight-charts 渲染股价走势图
 * 支持深色模式和响应式容器
 */
const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 初始化图表设置
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
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // 添加面积图系列 (Area Series) 以展现股价走势
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.3)',
      bottomColor: 'rgba(16, 185, 129, 0)',
      lineWidth: 2,
    });

    // 模拟历史股价数据 (Mock Data)
    const mockData = [
      { time: '2025-03-01', value: 150.25 },
      { time: '2025-03-02', value: 152.40 },
      { time: '2025-03-03', value: 148.90 },
      { time: '2025-03-04', value: 151.10 },
      { time: '2025-03-05', value: 155.30 },
      { time: '2025-03-06', value: 153.80 },
      { time: '2025-03-07', value: 158.45 },
      { time: '2025-03-08', value: 160.20 },
    ];
    
    // @ts-ignore - 兼容不同的时间格式
    areaSeries.setData(mockData);

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // 监听窗口大小变化以自适应宽度
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // 组件卸载时销毁图表
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 p-6 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">{symbol} 历史价格走势</h3>
          <p className="text-sm text-gray-400 mt-1">最近 7 天数据概览</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-mono font-bold text-emerald-400">160.20</span>
          <span className="text-xs font-medium text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded">+2.45% 今天</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full h-[400px] chart-container" />
    </div>
  );
};

export default PriceChart;
