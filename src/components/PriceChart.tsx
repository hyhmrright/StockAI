import React from 'react';
import { BarChart3 } from 'lucide-react';

interface PriceChartProps {
  /** 股票代码 */
  symbol: string;
}

/**
 * PriceChart 占位组件
 * 行情数据 API 尚未接入，展示明确的占位状态而非误导性的 mock 数据
 */
const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => {
  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 p-6 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">{symbol} 历史价格走势</h3>
          <p className="text-sm text-gray-400 mt-1">行情数据即将接入</p>
        </div>
      </div>
      <div className="w-full h-[400px] flex flex-col items-center justify-center text-gray-500 bg-white/[0.02] rounded-lg border border-dashed border-white/10">
        <BarChart3 className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">实时行情图表开发中</p>
        <p className="text-xs text-gray-600 mt-1">后续版本将接入历史价格数据</p>
      </div>
    </div>
  );
};

export default PriceChart;
