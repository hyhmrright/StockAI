import { detectMarket } from '../../../shared/market';
import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { getAllMasterSignals } from '../../lib/db';
import { loadMasterHistory } from '../../lib/master-history';
import { evaluateMasterSignals, simulateMasterPortfolio } from '../../lib/master-evaluation';
import NavSparkline from '../MasterPortfolio/NavSparkline';
import type { MasterPortfolioData, MasterNavPoint } from '../../../shared/types';
import { inputClass, buttonClass, type WorkspaceProps } from './common';
export default function MastersTab({ run }: WorkspaceProps) {
  const { t } = useLanguage();
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(20),
    [data, setData] = useState<MasterPortfolioData | null>(null),
    [curves, setCurves] = useState<Record<string, MasterNavPoint[]>>({});
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select
          className={inputClass}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setData(null);
          }}
        >
          <option value="">{t('research_all_models')}</option>
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select
          className={inputClass}
          value={horizon}
          onChange={(e) => {
            setHorizon(Number(e.target.value));
            setData(null);
          }}
        >
          {[5, 20, 60].map((n) => (
            <option key={n} value={n}>
              {n} {t('research_trading_days')}
            </option>
          ))}
        </select>
        <button
          className={buttonClass}
          onClick={() =>
            run(async () => {
              const all = await getAllMasterSignals();
              setModels([...new Set(all.map((s) => s.modelFingerprint ?? 'legacy'))]);
              const signals = model
                ? all.filter((s) => (s.modelFingerprint ?? 'legacy') === model)
                : all;
              const history = await loadMasterHistory(signals);
              setData(evaluateMasterSignals(signals, history, horizon));
              setCurves(
                Object.fromEntries(
                  [...new Set(signals.map((s) => s.masterId))].flatMap((id) =>
                    ['A股', '美股'].map((market) => [
                      `${id}:${market}`,
                      simulateMasterPortfolio(
                        signals.filter(
                          (s) => s.masterId === id && detectMarket(s.symbol) === market,
                        ),
                        history,
                      ),
                    ]),
                  ),
                ),
              );
            })
          }
        >
          {t('research_refresh')}
        </button>
      </div>
      <p className="text-xs text-gray-400">{t('research_master_rules')}</p>
      {data?.leaderboard.map((row) => (
        <article key={row.masterId} className="p-4 border border-white/10 rounded-xl space-y-2">
          <p>
            {row.masterId} · {row.resolved}/{row.total} ·{' '}
            {row.hitRate === null ? '—' : `${(row.hitRate * 100).toFixed(1)}%`}
          </p>
          <p className="text-xs">
            {t('research_signal_mean')}:{' '}
            {row.avgReturn === null ? '—' : `${(row.avgReturn * 100).toFixed(2)}%`}
          </p>
          <p className="text-xs">
            {t('research_excess_return')}:{' '}
            {row.avgExcessReturn == null ? '—' : `${(row.avgExcessReturn * 100).toFixed(2)}%`}
          </p>
          <div className="flex justify-between">
            <span className="text-xs">{t('research_sim_nav')}</span>
            <div className="space-y-3">
              {['A股', '美股'].map((market) => (
                <div key={market}>
                  <span className="text-xs text-gray-500">{market === 'A股' ? 'CNY' : 'USD'}</span>
                  <NavSparkline
                    points={curves[`${row.masterId}:${market}`] ?? []}
                    width={250}
                    height={45}
                  />
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
