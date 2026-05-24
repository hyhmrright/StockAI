import { describe, test, expect } from 'bun:test';
import { runDeepAnalysis } from './deep-analysis';
import type { QuantBundle, StockNews } from '../shared/types';
import type { ChatProvider } from './agents/types';

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: { signal: 'bullish', confidence: 70, details: {} },
  fundamental: { signal: 'neutral', confidence: 55, details: { roe: 18, pe: 30 } },
  composite: { signal: 'bullish', score: 64 },
  fetchedAt: Date.now(),
};
const mockNews: StockNews[] = [
  { title: 'Good news', source: 'Reuters', date: '2026-05-20', content: '', url: '' },
];
const mockChat: ChatProvider = {
  chat: async () => JSON.stringify({ signal: 'bullish', confidence: 75, reasoning: '看好', items: [{ index: 1, sentiment: 'positive' }], overall: 'positive', summary: '综合看好', consensus: 85 }),
};

describe('runDeepAnalysis', () => {
  test('runs selected masters and returns DeepAnalysisResult', async () => {
    const result = await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: mockChat,
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });
    expect(result.masterSignals).toHaveLength(2);
    expect(result.masterSignals[0].masterId).toBe('warren-buffett');
    expect(result.masterSignals[1].masterId).toBe('ben-graham');
    expect(result.sentiment).toHaveProperty('newsBreakdown');
    expect(result.synthesis).toHaveProperty('signal');
    expect(result.synthesis).toHaveProperty('consensus');
  });

  test('handles individual agent failures gracefully', async () => {
    let callCount = 0;
    const flakyChat: ChatProvider = {
      chat: async () => {
        callCount++;
        if (callCount === 1) throw new Error('first call fails');
        return JSON.stringify({ signal: 'bullish', confidence: 70, reasoning: '好', items: [{ index: 1, sentiment: 'positive' }], overall: 'positive', summary: '好', consensus: 80 });
      },
    };
    const result = await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: flakyChat,
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });
    expect(result.masterSignals).toHaveLength(2);
    const failedAgent = result.masterSignals.find(s => s.signal === 'neutral');
    expect(failedAgent).toBeTruthy();
  });
});
