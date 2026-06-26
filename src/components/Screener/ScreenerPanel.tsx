import React from 'react';
import { Search, Loader2, RotateCcw } from 'lucide-react';
import ScreenerTable from './ScreenerTable';
import type { ScreenerResult } from '../../../shared/types';

interface ScreenerPanelProps {
  results: ScreenerResult[];
  scanning: boolean;
  progress: { done: number; total: number };
  onScan: () => void;
  onSelect: (symbol: string) => void;
}

const ScreenerPanel: React.FC<ScreenerPanelProps> = ({
  results,
  scanning,
  progress,
  onScan,
  onSelect,
}) => {
  const hasResults = results.length > 0;
  const isDone = !scanning && hasResults;

  return (
    <div className="mt-4 mb-6 p-4 bg-white/5 rounded-2xl border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">自选股筛选</h3>
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
        >
          {scanning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              {progress.done}/{progress.total}
            </>
          ) : isDone ? (
            <>
              <RotateCcw className="w-3 h-3" />
              重新扫描
            </>
          ) : (
            <>
              <Search className="w-3 h-3" />
              开始扫描
            </>
          )}
        </button>
      </div>

      {scanning && (
        <div className="mb-3">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <ScreenerTable results={results} onSelect={onSelect} />
    </div>
  );
};

export default ScreenerPanel;
