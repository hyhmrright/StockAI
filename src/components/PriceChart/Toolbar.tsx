import React from 'react';
import type { KlineRange } from '../../../shared/types';
import type { ChartConfig, SubChartIndicator } from './types';

interface Props {
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
  onScreenshot?: () => void;
}

const RANGES: { value: KlineRange; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '5d', label: '5D' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
];

const SUB_INDICATORS: { value: SubChartIndicator; label: string }[] = [
  { value: 'macd', label: 'MACD' },
  { value: 'rsi', label: 'RSI' },
  { value: 'kdj', label: 'KDJ' },
  { value: 'boll', label: 'BOLL' },
  { value: 'obv', label: 'OBV' },
  { value: 'vwap', label: 'VWAP' },
];

const Toolbar: React.FC<Props> = ({ config, onChange, onScreenshot }) => {
  const update = (patch: Partial<ChartConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
      {/* 时间范围 segmented control */}
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => update({ range: r.value })}
            className={`px-2.5 py-1 text-xs rounded font-mono transition ${
              config.range === r.value
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* 工具栏右侧 */}
      <div className="flex items-center gap-2 text-xs">
        <select
          value={config.subIndicator}
          onChange={(e) => update({ subIndicator: e.target.value as SubChartIndicator })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200"
          title="副图指标"
        >
          {SUB_INDICATORS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => update({ logScale: !config.logScale })}
          className={`px-2 py-1 rounded border ${
            config.logScale
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'border-white/10 text-gray-400 hover:text-white'
          }`}
          title="对数坐标"
        >
          对数
        </button>

        <select
          value={config.adjust}
          onChange={(e) => update({ adjust: e.target.value as 'qfq' | 'hfq' | 'none' })}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200"
          title="复权方式"
        >
          <option value="qfq">前复权</option>
          <option value="hfq">后复权</option>
          <option value="none">不复权</option>
        </select>

        <input
          value={config.compareSymbol || ''}
          onChange={(e) => update({ compareSymbol: e.target.value || undefined })}
          placeholder="比较 (如 SPY)"
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-gray-200 w-24"
        />

        {onScreenshot && (
          <button
            onClick={onScreenshot}
            className="px-2 py-1 border border-white/10 rounded text-gray-400 hover:text-white"
            title="截图"
          >
            截图
          </button>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
