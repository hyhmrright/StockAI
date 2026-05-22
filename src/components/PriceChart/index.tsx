import React from "react";

interface PriceChartProps {
  symbol: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => (
  <div className="w-full bg-panel rounded-xl border border-white/10 p-8 text-center text-gray-500">
    PriceChart 占位 ({symbol}) — 待 Task 13 起逐步实现
  </div>
);

export default PriceChart;
