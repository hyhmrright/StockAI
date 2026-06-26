import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Bell } from 'lucide-react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useScreener } from '../hooks/useScreener';
import { usePriceAlerts } from '../hooks/usePriceAlerts';
import { useAlertMonitor } from '../hooks/useAlertMonitor';
import { saveAnalysisRecord } from '../lib/db';
import ScreenerPanel from './Screener/ScreenerPanel';
import AlertConfig from './AlertConfig';
import { useLanguage } from '../hooks/useLanguage';

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
  const [showScreener, setShowScreener] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState<string | null>(null);
  const screener = useScreener();
  const { alerts, setAlert, removeAlert } = usePriceAlerts();
  useAlertMonitor(alerts);
  const savedScreenerCount = useRef(0);
  const { t } = useLanguage();

  useEffect(() => {
    if (screener.scanning || screener.results.length === 0) return;
    if (screener.results.length === savedScreenerCount.current) return;
    savedScreenerCount.current = screener.results.length;
    const symbols = screener.results.map((r) => r.symbol).join(',');
    saveAnalysisRecord({
      symbol: symbols,
      analysisType: 'screener',
      resultJson: JSON.stringify(screener.results),
    }).catch((e) => console.error('保存筛选结果失败:', e));
  }, [screener.scanning, screener.results]);

  function handleAdd() {
    if (!input.trim()) return;
    add(input);
    setInput('');
  }

  return (
    <aside className="w-1/4 border-r border-white/10 bg-panel p-6 overflow-y-auto hidden md:flex flex-col gap-4">
      <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">
        {t('watchlist_title')}
      </h2>

      {/* 添加输入框 */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('watchlist_placeholder')}
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
          <p className="text-gray-600 text-xs text-center pt-4">{t('no_watchlist')}</p>
        )}
        {items.map((item) => {
          const hasAlert = alerts[item.sym]?.enabled;
          return (
            <div key={item.sym}>
              <div
                onClick={() => onSelect(item.sym)}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  currentSymbol === item.sym
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                }`}
              >
                <span
                  className={`font-bold text-sm transition-colors ${
                    currentSymbol === item.sym
                      ? 'text-emerald-400'
                      : 'text-gray-200 group-hover:text-emerald-400'
                  }`}
                >
                  {item.sym}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAlertSymbol((s) => (s === item.sym ? null : item.sym));
                    }}
                    className={`p-0.5 rounded transition-all ${
                      hasAlert
                        ? 'text-amber-400'
                        : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-amber-400'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(item.sym);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-rose-400 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {alertSymbol === item.sym && (
                <AlertConfig
                  symbol={item.sym}
                  alert={alerts[item.sym]}
                  onSave={setAlert}
                  onRemove={removeAlert}
                  onClose={() => setAlertSymbol(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 筛选器 */}
      <button
        onClick={() => setShowScreener((s) => !s)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
      >
        {showScreener ? t('collapse_screener') : t('expand_screener')}
      </button>

      {showScreener && (
        <ScreenerPanel
          results={screener.results}
          scanning={screener.scanning}
          progress={screener.progress}
          onScan={() => screener.scan(items)}
          onSelect={onSelect}
        />
      )}
    </aside>
  );
};

export default Watchlist;
