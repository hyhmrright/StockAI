import React from 'react';

/**
 * WatchlistItem 接口定义了关注列表项的数据结构
 */
export interface WatchlistItem {
  sym: string;
  name: string;
  price: string;
  change: string;
}

interface WatchlistProps {
  currentSymbol: string;
  onSelect: (symbol: string) => void;
}

/**
 * Watchlist 组件显示用户关注的股票列表
 * 
 * @param currentSymbol 当前选中的股票代码
 * @param onSelect 当选择一个股票时的回调函数
 */
const Watchlist: React.FC<WatchlistProps> = ({ currentSymbol, onSelect }) => {
  // 模拟的关注列表数据
  const items: WatchlistItem[] = [
    { sym: 'AAPL', name: 'Apple Inc.', price: '160.20', change: '+2.45%' },
    { sym: 'TSLA', name: 'Tesla, Inc.', price: '185.30', change: '-1.20%' },
    { sym: 'NVDA', name: 'NVIDIA Corp.', price: '820.45', change: '+4.12%' },
    { sym: 'MSFT', name: 'Microsoft Corp.', price: '410.15', change: '+0.85%' },
  ];

  return (
    <aside className="w-1/4 border-r border-white/10 bg-panel p-6 overflow-y-auto hidden md:block">
      <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">关注列表 (Watchlist)</h2>
      <div className="space-y-3">
        {items.map(item => (
          <div 
            key={item.sym} 
            onClick={() => onSelect(item.sym)}
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
  );
};

export default Watchlist;
