import React, { useState } from 'react';
import { X, Sparkles, Loader2, Search } from 'lucide-react';
import type {
  ScreenBoard,
  ScreenComparator,
  ScreenField,
  ScreenQuery,
} from '../../../shared/types';
import type { TranslationKey } from '../../i18n';
import { useLanguage } from '../../hooks/useLanguage';
import { useNlScreener } from '../../hooks/useNlScreener';
import NlScreenerTable from './NlScreenerTable';

// 字段 → i18n 标签 key（显式 Record 让 tsc 校验每个 key 存在，缺失即编译报错）
const FIELD_LABEL_KEY: Record<ScreenField, TranslationKey> = {
  price: 'screener_field_price',
  changePercent: 'screener_field_changePercent',
  pe: 'screener_field_pe',
  pb: 'screener_field_pb',
  marketCap: 'screener_field_marketCap',
  turnoverRate: 'screener_field_turnoverRate',
  roe: 'screener_field_roe',
  netMargin: 'screener_field_netMargin',
  grossMargin: 'screener_field_grossMargin',
  debtToAsset: 'screener_field_debtToAsset',
  currentRatio: 'screener_field_currentRatio',
  revenueGrowth: 'screener_field_revenueGrowth',
  netIncomeGrowth: 'screener_field_netIncomeGrowth',
  compositeScore: 'screener_field_compositeScore',
};

const BOARD_LABEL_KEY: Record<ScreenBoard, TranslationKey> = {
  main: 'screener_board_main',
  star: 'screener_board_star',
  chinext: 'screener_board_chinext',
  bj: 'screener_board_bj',
  all: 'screener_board_all',
};

// 数学符号非可译文本，直接常量
const OP_SYMBOL: Record<ScreenComparator, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
};

interface NlScreenerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

/** 把 query 回显成人类可读 chip 文案（AI 理解为：ROE ≥ 15 · PE < 20 · 主板） */
function buildChips(query: ScreenQuery, t: ReturnType<typeof useLanguage>['t']): string[] {
  const conds = query.conditions.map(
    (c) => `${t(FIELD_LABEL_KEY[c.field])} ${OP_SYMBOL[c.op]} ${c.value}`,
  );
  return query.board !== 'all' ? [...conds, t(BOARD_LABEL_KEY[query.board])] : conds;
}

/**
 * #14 自然语言选股模态：输入自然语言 → sidecar 两阶段全市场筛选 → 条件回显 + 命中表格。
 * v1 仅 A 股全市场（UI 明示）；进度不可流式故用不确定态 spinner（见蓝图 §5）。
 */
const NlScreenerModal: React.FC<NlScreenerModalProps> = ({ isOpen, onClose, onSelect }) => {
  const { t } = useLanguage();
  const { response, loading, errorKey, run, clear } = useNlScreener();
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const close = () => {
    clear();
    setQuery('');
    onClose();
  };
  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    close();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading) run(query);
  };

  const chips = response ? buildChips(response.query, t) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
      onClick={close}
    >
      <div
        className="bg-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="font-bold text-gray-100">{t('screener_title')}</div>
              <div className="text-[11px] text-gray-500">{t('screener_a_share_only')}</div>
            </div>
          </div>
          <button
            onClick={close}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
            title={t('close')}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 输入区 */}
        <form onSubmit={submit} className="flex items-center gap-3 px-6 py-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('screener_input_placeholder')}
              className="w-full bg-background border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.trim() === ''}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all whitespace-nowrap"
          >
            {t('screener_run')}
          </button>
        </form>

        {/* 结果区（loading / error / 结果 / 空） */}
        <div className="px-6 pb-6 overflow-y-auto scrollbar-hide">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-emerald-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('screener_running')}
            </div>
          )}

          {!loading && errorKey && (
            <p className="py-8 text-center text-sm text-rose-400">{t(errorKey)}</p>
          )}

          {!loading && !errorKey && response && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-[11px] text-gray-500 mr-1">
                  {t('screener_understood_as')}
                </span>
                {chips.map((c) => (
                  <span
                    key={c}
                    className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[11px] font-medium"
                  >
                    {c}
                  </span>
                ))}
              </div>

              {response.matches.length > 0 ? (
                <>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                    <span>{t('screener_result_count', { n: response.matches.length })}</span>
                    {response.refinedCount > 0 && (
                      <span>{t('screener_refined_note', { n: response.refinedCount })}</span>
                    )}
                  </div>
                  <NlScreenerTable matches={response.matches} onSelect={handleSelect} />
                </>
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">{t('screener_no_match')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NlScreenerModal;
