import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import type { PositionInput } from '../../../shared/types';

interface Props {
  onSubmit: (input: PositionInput) => void;
}

/**
 * 建仓 / 加仓表单。
 *
 * 校验只拦「非数字」与「≤ 0」两种：份额与成本价为 0 或负数会让下游的收益率、
 * 权重全部退化成无意义的值，且用户不可能真想记这样一笔。其余交给用户自己判断。
 */
const PositionForm: React.FC<Props> = ({ onSubmit }) => {
  const { t } = useLanguage();
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = Number(shares);
    const c = Number(costPrice);
    if (!symbol.trim() || !Number.isFinite(s) || s <= 0 || !Number.isFinite(c) || c <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit({
      symbol: symbol.trim().toUpperCase(),
      shares: s,
      costPrice: c,
      openedAt: Date.now(),
      note: note.trim() || undefined,
    });
    setSymbol('');
    setShares('');
    setCostPrice('');
    setNote('');
  }

  const field =
    'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-emerald-500/40';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder={t('holdings_symbol')}
          className={field}
        />
        <input
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder={t('holdings_shares')}
          inputMode="decimal"
          className={field}
        />
        <input
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          placeholder={t('holdings_cost_price')}
          inputMode="decimal"
          className={field}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('holdings_note_placeholder')}
          className={field}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className={`text-xs ${invalid ? 'text-rose-400' : 'text-gray-600'}`}>
          {invalid ? t('holdings_invalid_input') : t('holdings_merge_hint')}
        </p>
        <button
          type="submit"
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('holdings_add')}
        </button>
      </div>
    </form>
  );
};

export default PositionForm;
