import React from 'react';
import type { DeepAnalysisResult } from '../../../shared/types';
import MasterCard from './MasterCard';
import SynthesisSummary from './SynthesisSummary';
import MasterConsensusBreakdown from './MasterConsensusBreakdown';
import SentimentBreakdown from './SentimentBreakdown';

interface DeepAnalysisPanelProps {
  result: DeepAnalysisResult;
}

const DeepAnalysisPanel: React.FC<DeepAnalysisPanelProps> = ({ result }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">深度大师分析</h2>
      <SynthesisSummary synthesis={result.synthesis} totalMasters={result.masterSignals.length} />
      <MasterConsensusBreakdown signals={result.masterSignals} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        {result.masterSignals.map((signal) => (
          <MasterCard key={signal.masterId} signal={signal} />
        ))}
      </div>
      <SentimentBreakdown sentiment={result.sentiment} />
    </div>
  );
};

export default DeepAnalysisPanel;
