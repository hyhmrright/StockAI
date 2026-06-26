import { describe, test, expect } from 'bun:test';
import { agent } from './warren-buffett';
import type { MasterAnalysisContext } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: {
    signal: 'bullish',
    confidence: 75,
    details: { rsi: 55, adx: 30, alignment: 'bullish' },
  },
  fundamental: {
    signal: 'bullish',
    confidence: 65,
    details: { roe: 25, net_margin: 20, pe: 28, pb: 12, debt_to_asset: 30 },
  },
  composite: { signal: 'bullish', score: 72 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  {
    title: 'Apple reports record revenue',
    source: 'Reuters',
    date: '2026-05-20',
    content: 'Strong earnings beat',
    url: '',
  },
];

function createMockChat(response: string) {
  return { chat: async () => response };
}

describe('warren-buffett agent', () => {
  test('meta has correct id and fields', () => {
    expect(agent.meta.id).toBe('warren-buffett');
    expect(agent.meta.nameZh).toBeTruthy();
    expect(agent.meta.styleZh).toBeTruthy();
  });

  test('analyze returns valid MasterSignal on success', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: createMockChat(
        JSON.stringify({ signal: 'bullish', confidence: 85, reasoning: '护城河深厚' }),
      ),
    };
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('warren-buffett');
    expect(result.signal).toBe('bullish');
    expect(result.confidence).toBe(85);
    expect(result.reasoning).toBe('护城河深厚');
  });

  test('analyze returns neutral on LLM failure', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: {
        chat: async () => {
          throw new Error('timeout');
        },
      },
    };
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('warren-buffett');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
  });

  test('analyze returns neutral on invalid JSON', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: createMockChat('not json'),
    };
    const result = await agent.analyze(ctx);
    expect(result.signal).toBe('neutral');
  });
});
