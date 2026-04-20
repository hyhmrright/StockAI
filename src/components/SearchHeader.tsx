import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { searchStocks } from '../lib/ipc';
import { StockSearchResult } from '../../shared/types';

interface SearchHeaderProps {
  onSearch: (symbol: string) => void;
  loading: boolean;
  onOpenSettings: () => void;
  stepLabel: string;
}

/**
 * SearchHeader 组件包含顶部的搜索表单和系统设置入口
 */
const SearchHeader: React.FC<SearchHeaderProps> = ({ 
  onSearch, 
  loading, 
  onOpenSettings, 
  stepLabel 
}) => {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchSymbol.trim().length >= 2) {
        setIsSearching(true);
        try {
          const data = await searchStocks(searchSymbol);
          setResults(data);
          setShowDropdown(data.length > 0);
        } catch (err) {
          console.error('搜索失败:', err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchSymbol]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 处理搜索提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      onSearch(searchSymbol.trim().toUpperCase());
      setShowDropdown(false);
    }
  };

  // 选择搜索结果
  const handleSelect = (item: StockSearchResult) => {
    setSearchSymbol(item.code);
    onSearch(item.fullCode || item.code);
    setShowDropdown(false);
  };

  return (
    <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-panel shrink-0 z-10">
      <form onSubmit={handleSubmit} className="flex items-center w-full max-w-2xl gap-4">
        <div className="relative w-full group" ref={dropdownRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
          <input
            type="text"
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="搜索股票代码或名称 (例如: AAPL, 隆基绿能, 300866)..."
            className="w-full bg-background border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
          )}

          {/* 搜索建议下拉列表 */}
          {showDropdown && (
            <div className="absolute top-full left-0 w-full mt-2 bg-panel border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50">
              <div className="max-h-60 overflow-y-auto">
                {results.map((item, index) => (
                  <div
                    key={`${item.code}-${index}`}
                    onClick={() => handleSelect(item)}
                    className="px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between group"
                  >
                    <div className="flex flex-col">
                      <span className="text-white font-medium group-hover:text-emerald-400 transition-colors">{item.name}</span>
                      <span className="text-xs text-gray-400">{item.code}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-gray-500 bg-white/5">
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
