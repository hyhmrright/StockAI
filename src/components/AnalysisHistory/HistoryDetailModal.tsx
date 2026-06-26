import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getAnalysisDetail } from '../../lib/db';
import type {
  AnalysisRecord,
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

interface HistoryDetailModalProps {
  recordId: number | null;
  onClose: () => void;
}

const HistoryDetailModal: React.FC<HistoryDetailModalProps> = ({ recordId, onClose }) => {
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState(false);

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
      return <p className="text-sm text-gray-500 py-8 text-center">记录未找到</p>;
    }

    try {
      const data = JSON.parse(record.resultJson);
      const time = new Date(record.analyzedAt).toLocaleString('zh-CN');

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
      return <p className="text-sm text-rose-400">结果解析失败</p>;
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
          <h3 className="text-sm font-bold text-gray-300">历史分析详情</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{renderContent()}</div>
      </div>
    </div>
  );
};

function AIDetail({ data, time }: { data: AIAnalysisResult; time: string }) {
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

function DeepDetail({ data, time }: { data: DeepAnalysisResult; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <DeepAnalysisPanel result={data} />
    </div>
  );
}

function QuantDetail({ data, time }: { data: QuantBundle; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <QuantScoreCard quant={data} loading={false} error={null} />
      <ValuationCard valuation={data.valuation} loading={false} />
      <RiskCard risk={data.risk} loading={false} />
    </div>
  );
}

function BacktestDetail({ data, time }: { data: BacktestResult; time: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-gray-500">{time}</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="总收益" value={`${((data.totalReturn ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="年化收益" value={`${((data.annualizedReturn ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="最大回撤" value={`${((data.maxDrawdown ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="胜率" value={`${((data.winRate ?? 0) * 100).toFixed(0)}%`} />
        <Stat label="Sharpe" value={data.sharpeRatio?.toFixed(2) ?? '—'} />
        <Stat label="交易次数" value={String(data.totalTrades ?? 0)} />
      </div>
    </div>
  );
}

function ScreenerDetail({ data, time }: { data: ScreenerResult[]; time: string }) {
  if (!Array.isArray(data)) return <p className="text-sm text-gray-500">无效筛选数据</p>;
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-gray-500">
        {time} · {data.length} 只股票
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white/5 rounded-xl">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-mono font-bold text-gray-200">{value}</div>
    </div>
  );
}

export default HistoryDetailModal;
