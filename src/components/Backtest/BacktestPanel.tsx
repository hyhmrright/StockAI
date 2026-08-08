import React, { useState, useCallback, useEffect } from 'react';
import { runBacktest } from '../../lib/ipc';
import { useLanguage } from '../../hooks/useLanguage';
import { formatServiceError } from '../../lib/service-errors';
import type { BacktestResult } from '../../../shared/types';

interface BacktestPanelProps {
  symbol: string;
  /** 回测结果（受控：由 Dashboard 持有，供 PriceChart 叠加买卖点/净值曲线共用同一份数据） */
  result: BacktestResult | null;
  /** 结果上提：跑完回测 / 「重新回测」时通知父级，切 symbol 时由父级清空 */
  onResult: (result: BacktestResult | null) => void;
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

const BacktestPanel: React.FC<BacktestPanelProps> = ({ symbol, result, onResult }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  // result 由父级持有并随 symbol 变化清空，这里只重置本地瞬态（loading/error）
  useEffect(() => {
    setError(null);
    setLoading(false);
  }, [symbol]);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      onResult(await runBacktest(symbol));
    } catch (err) {
      setError(formatServiceError(err, t, 'err_backtest'));
    } finally {
      setLoading(false);
    }
  }, [symbol, onResult, t]);

  return (
    <div className="mb-6">
      <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">
        {t('backtest_title')}
      </h2>

      {!result && (
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-400 border border-violet-500/20 hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
        >
          {loading ? t('backtest_running') : t('backtest_run')}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      {result && (
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{t('backtest_result')}</span>
            <button
              onClick={() => onResult(null)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              {t('backtest_rerun')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label={t('backtest_strategy_return')}
              value={formatPct(result.totalReturn)}
              valueClass={pctColor(result.totalReturn)}
            />
            <MetricCard
              label={t('backtest_buy_hold')}
              value={formatPct(result.buyAndHoldReturn)}
              valueClass={pctColor(result.buyAndHoldReturn)}
            />
            <MetricCard
              label={t('max_drawdown')}
              value={formatPct(result.maxDrawdown)}
              valueClass="text-rose-400"
            />
            <MetricCard
              label={t('sharpe_ratio')}
              value={Number.isFinite(result.sharpeRatio) ? result.sharpeRatio.toFixed(2) : 'N/A'}
            />
          </div>

          <div className="flex justify-between text-[10px] text-gray-500">
            <span>
              {t('backtest_trades')}: {result.totalTrades}
            </span>
            <span>
              {t('history_win_rate')}: {(result.winRate * 100).toFixed(0)}%
            </span>
            <span>
              {t('backtest_annualized_short')}: {formatPct(result.annualizedReturn)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BacktestPanel;
