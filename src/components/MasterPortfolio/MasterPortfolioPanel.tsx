import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trophy, RefreshCw, Loader2 } from 'lucide-react';
import { useMasterPortfolio } from '../../hooks/useMasterPortfolio';
import { useLanguage } from '../../hooks/useLanguage';
import { getMasterMeta } from '../DeepAnalysis/master-meta';
import NavSparkline from './NavSparkline';
import type { MasterLeaderboardEntry } from '../../../shared/types';

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

function hitRateColor(rate: number): string {
  if (rate >= 0.6) return 'text-emerald-400';
  if (rate >= 0.4) return 'text-amber-400';
  return 'text-rose-400';
}

const MasterPortfolioPanel: React.FC = () => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  // 懒加载：仅展开后才付出报价请求成本
  const { step, data, refetch } = useMasterPortfolio(open);

  const navCurves = data?.navCurves ?? {};

  function masterName(masterId: string): string {
    const meta = getMasterMeta(masterId);
    if (!meta) return masterId;
    return language === 'zh' ? meta.nameZh : meta.name;
  }

  function renderRow(e: MasterLeaderboardEntry) {
    return (
      <div
        key={e.masterId}
        className="flex items-center gap-2 py-2 border-b border-white/5 last:border-b-0"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-white truncate">{masterName(e.masterId)}</div>
          <div className="text-[10px] text-gray-500">
            {t('mp_col_samples')} {e.resolved}/{e.total}
            {e.pending > 0 && ` · ${e.pending} ${t('mp_pending')}`}
          </div>
        </div>
        <NavSparkline points={navCurves[e.masterId] ?? []} />
        <div className="w-12 text-right">
          {e.hitRate === null ? (
            <span className="text-xs text-gray-600">—</span>
          ) : (
            <span className={`text-sm font-bold ${hitRateColor(e.hitRate)}`}>
              {(e.hitRate * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="w-14 text-right text-[11px] tabular-nums">
          {e.avgReturn === null ? (
            <span className="text-gray-600">—</span>
          ) : (
            <span className={e.avgReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {formatPct(e.avgReturn)}
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderBody() {
    if (step === 'loading') {
      return (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('master_portfolio_loading')}
        </div>
      );
    }
    if (step === 'error') {
      return (
        <p className="py-4 text-xs text-rose-400 text-center">{t('master_portfolio_error')}</p>
      );
    }
    if (!data || data.totalSignals === 0) {
      return (
        <p className="py-4 text-xs text-gray-500 leading-relaxed">{t('master_portfolio_empty')}</p>
      );
    }

    const since = data.firstSignalAt ? new Date(data.firstSignalAt).toLocaleDateString() : '—';
    return (
      <>
        {data.resolvedSignals === 0 && (
          <p className="mb-2 text-[11px] text-amber-400/80 leading-relaxed">
            {t('master_portfolio_no_resolved')}
          </p>
        )}
        <div className="flex items-center gap-2 px-0 pb-1 text-[10px] text-gray-500 uppercase tracking-wider">
          <div className="flex-1">{t('mp_col_master')}</div>
          <div className="w-16 text-center">{t('mp_nav')}</div>
          <div className="w-12 text-right">{t('mp_col_hitrate')}</div>
          <div className="w-14 text-right">{t('mp_col_return')}</div>
        </div>
        <div>{data.leaderboard.map(renderRow)}</div>
        <p className="mt-3 text-[10px] text-gray-600 leading-relaxed">
          {t('master_portfolio_disclosure', {
            since,
            resolved: data.resolvedSignals,
            total: data.totalSignals,
          })}
        </p>
      </>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-gray-400 text-xs font-bold uppercase tracking-widest hover:text-gray-200 transition-colors"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          {t('master_portfolio_title')}
        </button>
        {open && (
          <button
            onClick={refetch}
            disabled={step === 'loading'}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${step === 'loading' ? 'animate-spin' : ''}`} />
            {t('mp_refresh')}
          </button>
        )}
      </div>
      {open && (
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">{renderBody()}</div>
      )}
    </div>
  );
};

export default MasterPortfolioPanel;
