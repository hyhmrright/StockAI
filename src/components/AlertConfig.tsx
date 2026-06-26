import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { PriceAlert } from '../hooks/usePriceAlerts';

interface AlertConfigProps {
  symbol: string;
  alert?: PriceAlert;
  onSave: (symbol: string, upper?: number, lower?: number) => void;
  onRemove: (symbol: string) => void;
  onClose: () => void;
}

const AlertConfig: React.FC<AlertConfigProps> = ({ symbol, alert, onSave, onRemove, onClose }) => {
  const [upper, setUpper] = useState(alert?.upperLimit?.toString() ?? '');
  const [lower, setLower] = useState(alert?.lowerLimit?.toString() ?? '');

  function handleSave() {
    const u = upper.trim() ? parseFloat(upper) : undefined;
    const l = lower.trim() ? parseFloat(lower) : undefined;
    if (u == null && l == null) return;
    onSave(symbol, u, l);
    onClose();
  }

  function handleRemove() {
    onRemove(symbol);
    onClose();
  }

  return (
    <div className="p-3 bg-white/5 rounded-xl border border-white/10 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 font-bold uppercase">价格提醒 {symbol}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="上限"
          value={upper}
          onChange={(e) => setUpper(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-emerald-500/40 w-0"
        />
        <input
          type="number"
          placeholder="下限"
          value={lower}
          onChange={(e) => setLower(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-rose-500/40 w-0"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
        >
          <Check className="w-3 h-3" />
          保存
        </button>
        {alert && (
          <button
            onClick={handleRemove}
            className="px-3 py-1 rounded text-[10px] font-medium bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
};

export default AlertConfig;
