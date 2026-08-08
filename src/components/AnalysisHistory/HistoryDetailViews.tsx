import React from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import type {
  AIAnalysisResult,
  DeepAnalysisResult,
  QuantBundle,
  BacktestResult,
  ScreenerResult,
} from '../../../shared/types';
import QuantScoreCard from '../QuantScoreCard';
import ValuationCard from '../ValuationCard';
import RiskCard from '../RiskCard';
import DeepAnalysisPanel from '../DeepAnalysis/DeepAnalysisPanel';
import SentimentBar from '../SentimentBar';

/**
 * 历史记录详情的按类型渲染视图。
 *
 * 与 HistoryDetailModal（弹窗外壳 + 取数 + 分派）分开：外壳只有一份，
 * 而每新增一种可持久化的分析类型就要在这里加一个视图，两者变更节奏不同。
 */

export function AIDetail({ data, time }: { data: AIAnalysisResult; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <SentimentBar bullish={data.rating} />
      <div className="p-3 bg-white/5 rounded-xl">
        <p className="text-xs text-gray-400 italic">"{data.summary}"</p>
      </div>
      {data.pros?.length > 0 && (
        <div className="space-y-2">
          {data.pros.map((p, i) => (
            <div
              key={i}
              className="text-xs text-emerald-400 p-2 bg-emerald-500/5 rounded-lg border-l-2 border-emerald-500"
            >
              {p}
            </div>
          ))}
        </div>
      )}
      {data.cons?.length > 0 && (
        <div className="space-y-2">
          {data.cons.map((c, i) => (
            <div
              key={i}
              className="text-xs text-rose-400 p-2 bg-rose-500/5 rounded-lg border-l-2 border-rose-500"
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeepDetail({ data, time }: { data: DeepAnalysisResult; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <DeepAnalysisPanel result={data} />
    </div>
  );
}

export function QuantDetail({ data, time }: { data: QuantBundle; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <QuantScoreCard quant={data} loading={false} error={null} />
      <ValuationCard valuation={data.valuation} loading={false} />
      <RiskCard risk={data.risk} loading={false} />
    </div>
  );
}

export function BacktestDetail({ data, time }: { data: BacktestResult; time: string }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={t('backtest_total_return')}
          value={`${((data.totalReturn ?? 0) * 100).toFixed(1)}%`}
        />
        <Stat
          label={t('backtest_annualized')}
          value={`${((data.annualizedReturn ?? 0) * 100).toFixed(1)}%`}
        />
        <Stat label={t('max_drawdown')} value={`${((data.maxDrawdown ?? 0) * 100).toFixed(1)}%`} />
        <Stat label={t('history_win_rate')} value={`${((data.winRate ?? 0) * 100).toFixed(0)}%`} />
        <Stat label="Sharpe" value={data.sharpeRatio?.toFixed(2) ?? '—'} />
        <Stat label={t('backtest_trades')} value={String(data.totalTrades ?? 0)} />
      </div>
    </div>
  );
}

export function ScreenerDetail({ data, time }: { data: ScreenerResult[]; time: string }) {
  const { t } = useLanguage();
  if (!Array.isArray(data))
    return <p className="text-sm text-gray-500">{t('history_invalid_screener')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500">
        {time} · {data.length} {t('history_stocks')}
      </p>
      {data.map((r) => (
        <div key={r.symbol} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
          <div>
            <span className="text-xs font-bold text-gray-200">{r.symbol}</span>
            <span className="text-[10px] text-gray-500 ml-2">{r.name}</span>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {r.quant?.composite?.score?.toFixed(1) ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-3 bg-white/5 rounded-xl">
    <div className="text-[10px] text-gray-500 mb-1">{label}</div>
    <div className="text-sm font-mono font-bold text-gray-200">{value}</div>
  </div>
);
