import { useLanguage } from '../../hooks/useLanguage';
import type { BacktestRequest } from '../../../shared/types';
import { Field, inputClass } from '../Research/common';
export type Options = Omit<BacktestRequest, 'symbol'>;
export default function BacktestOptions({
  value,
  onChange,
}: {
  value: Options;
  onChange: (v: Options) => void;
}) {
  const { t } = useLanguage();
  return (
    <details className="mb-3 text-xs text-gray-400">
      <summary>{t('research_backtest_settings')}</summary>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Field label={t('research_range')}>
          <select
            className={inputClass}
            value={value.range ?? '1y'}
            onChange={(e) => onChange({ ...value, range: e.target.value as Options['range'] })}
          >
            <option value="1y">1Y</option>
            <option value="5y">5Y</option>
            <option value="all">All</option>
          </select>
        </Field>
        {(['startDate', 'endDate'] as const).map((k) => (
          <Field key={k} label={t(k === 'startDate' ? 'research_before' : 'research_after')}>
            <input
              type="date"
              className={inputClass}
              value={value[k] ?? ''}
              onChange={(e) => onChange({ ...value, [k]: e.target.value || undefined })}
            />
          </Field>
        ))}
        {(
          [
            'buyThreshold',
            'sellThreshold',
            'initialCapital',
            'transactionCost',
            'slippage',
            'lotSize',
          ] as const
        ).map((k) => (
          <Field key={k} label={t(`research_bt_${k}`)}>
            <input
              className={inputClass}
              type="number"
              step="any"
              value={value[k] ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  [k]: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        ))}
      </div>
      <p className="mt-2">{t('research_next_open')}</p>
    </details>
  );
}
