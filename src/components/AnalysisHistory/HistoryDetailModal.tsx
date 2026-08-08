import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getAnalysisDetail } from '../../lib/db';
import { useLanguage } from '../../hooks/useLanguage';
import { localeOf } from '../../lib/locale';
import type { AnalysisRecord } from '../../../shared/types';
import {
  AIDetail,
  DeepDetail,
  QuantDetail,
  BacktestDetail,
  ScreenerDetail,
} from './HistoryDetailViews';

interface HistoryDetailModalProps {
  recordId: number | null;
  onClose: () => void;
}

const HistoryDetailModal: React.FC<HistoryDetailModalProps> = ({ recordId, onClose }) => {
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    if (recordId === null) {
      setRecord(null);
      return;
    }
    setLoading(true);
    getAnalysisDetail(recordId)
      .then((r) => setRecord(r))
      .catch((e) => console.error('加载分析详情失败:', e))
      .finally(() => setLoading(false));
  }, [recordId]);

  if (recordId === null) return null;

  function renderContent() {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      );
    }
    if (!record) {
      return <p className="text-sm text-gray-500 py-8 text-center">{t('history_not_found')}</p>;
    }

    try {
      const data = JSON.parse(record.resultJson);
      const time = new Date(record.analyzedAt).toLocaleString(localeOf(language));

      switch (record.type) {
        case 'ai':
          return <AIDetail data={data} time={time} />;
        case 'deep':
          return <DeepDetail data={data} time={time} />;
        case 'quant':
          return <QuantDetail data={data} time={time} />;
        case 'backtest':
          return <BacktestDetail data={data} time={time} />;
        case 'screener':
          return <ScreenerDetail data={data} time={time} />;
        default:
          return <pre className="text-xs text-gray-400 overflow-auto">{record.resultJson}</pre>;
      }
    } catch {
      return <p className="text-sm text-rose-400">{t('history_parse_error')}</p>;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4"
      >
        <div className="sticky top-0 bg-panel border-b border-white/10 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-gray-300">{t('history_detail_title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{renderContent()}</div>
      </div>
    </div>
  );
};

export default HistoryDetailModal;
