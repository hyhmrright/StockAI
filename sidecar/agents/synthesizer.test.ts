import { describe, test, expect } from 'bun:test';
import { computeConsensus, synthesize, FALLBACK_SUMMARY } from './synthesizer';
import type { MasterSignal, SentimentSignal, QuantBundle } from '../../shared/types';
import type { ChatProvider } from './types';

const bullishSignal = (id: string, conf = 80): MasterSignal => ({ masterId: id, signal: 'bullish', confidence: conf, reasoning: '看好' });
const bearishSignal = (id: string, conf = 70): MasterSignal => ({ masterId: id, signal: 'bearish', confidence: conf, reasoning: '看衰' });

describe('computeConsensus', () => {
  test('all bullish → 100', () => {
    expect(computeConsensus([bullishSignal('a'), bullishSignal('b'), bullishSignal('c')])).toBe(100);
  });
  test('mixed → between 50-100', () => {
    const c = computeConsensus([bullishSignal('a'), bearishSignal('b'), bullishSignal('c')]);
    expect(c).toBeGreaterThan(50);
    expect(c).toBeLessThan(100);
  });
  test('empty → 0', () => { expect(computeConsensus([])).toBe(0); });
});

describe('synthesize', () => {
  const mockQuant: QuantBundle = {
    symbol: 'AAPL',
    technical: { signal: 'bullish', confidence: 70, details: {} },
    fundamental: { signal: 'neutral', confidence: 55, details: {} },
    composite: { signal: 'bullish', score: 65 },
    fetchedAt: Date.now(),
  };
  const mockSentiment: SentimentSignal = {
    signal: 'bullish', confidence: 70,
    newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
  };

  test('calls LLM and returns DeepAnalysisResult', async () => {
    const masters = [bullishSignal('warren-buffett'), bullishSignal('ben-graham')];
    const chat: ChatProvider = {
      chat: async () => JSON.stringify({ signal: 'bullish', confidence: 82, summary: '综合看好', consensus: 95 }),
    };
    const r = await synthesize(masters, mockSentiment, mockQuant, chat);
    expect(r.masterSignals).toEqual(masters);
    expect(r.sentiment).toEqual(mockSentiment);
    expect(r.synthesis.signal).toBe('bullish');
    expect(r.synthesis.summary).toBe('综合看好');
  });

  test('falls back to local computation on LLM failure', async () => {
    const masters = [bullishSignal('a', 90), bearishSignal('b', 60), bullishSignal('c', 80)];
    const r = await synthesize(masters, mockSentiment, mockQuant, { chat: async () => { throw new Error('fail'); } });
    expect(r.synthesis.signal).toBe('bullish');
    expect(r.synthesis.consensus).toBeGreaterThan(50);
    expect(r.synthesis.summary).toBe(FALLBACK_SUMMARY['zh'](masters.length, 2, 1, 'bullish'));
  });

  test('language=en: fallback summary 使用英文', async () => {
    const masters = [bullishSignal('a', 90), bearishSignal('b', 60)];
    const r = await synthesize(masters, mockSentiment, mockQuant, { chat: async () => { throw new Error('fail'); } }, 'en');
    expect(r.synthesis.summary).toContain('analysts');
    expect(r.synthesis.summary).not.toContain('大师');
  });
});
