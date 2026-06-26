import React, { useState, useCallback, useEffect } from 'react';
import { runBacktest } from '../../lib/ipc';
import type { BacktestResult } from '../../../shared/types';

interface BacktestPanelProps {
  symbol: string;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return 'N/A';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}

function pctColor(n: number): string {
  return n >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

interface MetricCardProps {
  label: string;
  value: string;
  valueClass?: string;
}

function MetricCard({ label, value, valueClass = 'text-white' }: MetricCardProps) {
  return (
    <div className="p-3 bg-white/5 rounded-lg text-center">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

const BacktestPanel: React.FC<BacktestPanelProps> = ({ symbol }) => {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, [symbol]);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await runBacktest(symbol));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">策略回测</h2>

      {!result && (
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/20 hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
        >
          {loading ? '回测中...' : '运行回测（近1年）'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      {result && (
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">回测结果</span>
            <button
              onClick={() => setResult(null)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              重新回测
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="策略收益"
              value={formatPct(result.totalReturn)}
              valueClass={pctColor(result.totalReturn)}
            />
            <MetricCard
              label="买入持有"
              value={formatPct(result.buyAndHoldReturn)}
              valueClass={pctColor(result.buyAndHoldReturn)}
            />
            <MetricCard
              label="最大回撤"
              value={formatPct(result.maxDrawdown)}
              valueClass="text-rose-400"
            />
            <MetricCard
              label="夏普比率"
              value={Number.isFinite(result.sharpeRatio) ? result.sharpeRatio.toFixed(2) : 'N/A'}
            />
          </div>

          <div className="flex justify-between text-[10px] text-gray-500">
            <span>交易次数: {result.totalTrades}</span>
            <span>胜率: {(result.winRate * 100).toFixed(0)}%</span>
            <span>年化: {formatPct(result.annualizedReturn)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestPanel;
