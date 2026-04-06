import React, { useState } from 'react';
import { Search, Loader2, Settings as SettingsIcon } from 'lucide-react';

interface SearchHeaderProps {
  onSearch: (symbol: string) => void;
  loading: boolean;
  onOpenSettings: () => void;
  stepLabel: string;
}

/**
 * SearchHeader 组件包含顶部的搜索表单和系统设置入口
 * 
 * @param onSearch 执行搜索的回调函数
 * @param loading 是否正在进行分析
 * @param onOpenSettings 打开设置模态框的回调函数
 * @param stepLabel 分析进行中的步骤文字
 */
const SearchHeader: React.FC<SearchHeaderProps> = ({ 
  onSearch, 
  loading, 
  onOpenSettings, 
  stepLabel 
}) => {
  const [searchSymbol, setSearchSymbol] = useState('');

  // 处理搜索提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      onSearch(searchSymbol.trim().toUpperCase());
    }
  };

  return (
    <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-panel shrink-0 z-10">
      <form onSubmit={handleSubmit} className="flex items-center w-full max-w-2xl gap-4">
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
          disabled={loading}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? '分析中...' : '开始分析'}
        </button>
        {/* 在搜索栏显示当前分析进度 */}
        {loading && (
           <span className="text-xs text-emerald-500 animate-pulse hidden xl:inline truncate max-w-[200px]">
             {stepLabel}
           </span>
        )}
      </form>
      
      {/* 系统设置入口 */}
      <button 
        onClick={onOpenSettings}
        className="p-2 hover:bg-white/5 rounded-full transition-colors group"
        title="系统设置"
      >
        <SettingsIcon className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:rotate-45 transition-all duration-300" />
      </button>
    </header>
  );
};

export default SearchHeader;
