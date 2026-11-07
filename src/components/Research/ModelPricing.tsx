import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { Field, inputClass, buttonClass, type WorkspaceProps } from './common';
export default function ModelPricing({
  state,
  change,
  run,
  models,
}: { models: string[] } & WorkspaceProps) {
  const { t } = useLanguage();
  const [model, setModel] = useState(models[0] ?? ''),
    [input, setInput] = useState(''),
    [output, setOutput] = useState('');
  return (
    <details className="text-xs text-gray-400">
      <summary>{t('research_model_pricing')}</summary>
      <div className="grid grid-cols-3 gap-2 my-3">
        <select
          className={inputClass}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setInput(String(state.pricing?.[e.target.value]?.inputPerMillion ?? ''));
            setOutput(String(state.pricing?.[e.target.value]?.outputPerMillion ?? ''));
          }}
        >
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <Field label={t('research_input_price')}>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="any"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </Field>
        <Field label={t('research_output_price')}>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="any"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
          />
        </Field>
      </div>
      <button
        className={buttonClass}
        disabled={!model || !input || !output}
        onClick={() =>
          run(() =>
            change((s) => {
              const rate = { inputPerMillion: Number(input), outputPerMillion: Number(output) };
              if (!Object.values(rate).every((v) => Number.isFinite(v) && v >= 0))
                throw new Error('Invalid price');
              return { ...s, pricing: { ...s.pricing, [model]: rate } };
            }),
          )
        }
      >
        {t('research_save')}
      </button>
    </details>
  );
}
