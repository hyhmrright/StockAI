import React from 'react';

interface SentimentBarProps {
  /** 看涨百分比 (0-100) */
  bullish: number;
}

/**
 * SentimentBar 组件显示看涨与看跌情绪的对比
 * 使用 Tailwind CSS 实现一个左右分色的进度条
 */
const SentimentBar: React.FC<SentimentBarProps> = ({ bullish }) => {
  const bearish = 100 - bullish;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-emerald-500 font-bold">看涨 {bullish}%</span>
        <span className="text-rose-500 font-bold">看跌 {bearish}%</span>
      </div>
      <div className="h-2 w-full flex rounded-full overflow-hidden bg-gray-800">
        <div 
          className="h-full bg-emerald-500 transition-all duration-500 ease-out" 
          style={{ width: `${bullish}%` }}
        />
        <div 
          className="h-full bg-rose-500 transition-all duration-500 ease-out" 
          style={{ width: `${bearish}%` }}
        />
      </div>
    </div>
  );
};

export default SentimentBar;
