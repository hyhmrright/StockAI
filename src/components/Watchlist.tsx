import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useWatchlist } from '../hooks/useWatchlist';

interface WatchlistProps {
  currentSymbol: string;
  onSelect: (symbol: string) => void;
}

/**
 * 关注列表组件，支持增删并持久化到本地存储
 */
const Watchlist: React.FC<WatchlistProps> = ({ currentSymbol, onSelect }) => {
  const { items, add, remove } = useWatchlist();
  const [input, setInput] = useState('');

  function handleAdd() {
    if (!input.trim()) return;
    add(input);
    setInput('');
  }

  return (
    <aside className="w-1/4 border-r border-white/10 bg-panel p-6 overflow-y-auto hidden md:flex flex-col gap-4">
      <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">关注列表</h2>

      {/* 添加输入框 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="输入代码后回车"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-emerald-500/40"
        />
        <button
          onClick={handleAdd}
          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="space-y-2 flex-1">
        {items.length === 0 && (
          <p className="text-gray-600 text-xs text-center pt-4">暂无关注，输入代码添加</p>
        )}
        {items.map(item => (
          <div
            key={item.sym}
            onClick={() => onSelect(item.sym)}
            className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
              currentSymbol === item.sym
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-white/5 border-white/5 hover:bg-white/10'
            }`}
          >
            <span className={`font-bold text-sm transition-colors ${
              currentSymbol === item.sym ? 'text-emerald-400' : 'text-gray-200 group-hover:text-emerald-400'
            }`}>
              {item.sym}
            </span>
            <button
              onClick={e => { e.stopPropagation(); remove(item.sym); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-rose-400 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Watchlist;
