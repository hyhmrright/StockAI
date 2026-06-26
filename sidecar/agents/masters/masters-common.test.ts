import { describe, test, expect } from 'bun:test';
import type { MasterAgent, MasterAnalysisContext } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';

const ALL_MASTER_FILES = [
  'warren-buffett',
  'ben-graham',
  'charlie-munger',
  'michael-burry',
  'cathie-wood',
  'peter-lynch',
  'phil-fisher',
  'bill-ackman',
  'mohnish-pabrai',
  'nassim-taleb',
  'stanley-druckenmiller',
  'aswath-damodaran',
  'rakesh-jhunjhunwala',
];

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: {
    signal: 'bullish',
    confidence: 70,
    details: { rsi: 55, adx: 28, alignment: 'bullish', macd_trend: 'expanding', volume_ratio: 1.2 },
  },
  fundamental: {
    signal: 'neutral',
    confidence: 55,
    details: { roe: 18, net_margin: 15, pe: 30, pb: 8, debt_to_asset: 45, revenue_growth: 8 },
  },
  composite: { signal: 'bullish', score: 64 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  {
    title: 'Company reports earnings',
    source: 'Reuters',
    date: '2026-05-20',
    content: 'Beat expectations',
    url: '',
  },
];

describe('all master agents share contract', () => {
  for (const file of ALL_MASTER_FILES) {
    describe(file, () => {
      test('module exports agent with correct id', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        expect(agent.meta.id).toBe(file);
        expect(agent.meta.name).toBeTruthy();
        expect(agent.meta.nameZh).toBeTruthy();
        expect(agent.meta.style).toBeTruthy();
        expect(agent.meta.styleZh).toBeTruthy();
        expect(agent.meta.description).toBeTruthy();
      });

      test('analyze returns valid signal on success', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: {
            chat: async () =>
              JSON.stringify({ signal: 'bullish', confidence: 75, reasoning: '测试理由' }),
          },
        };
        const result = await agent.analyze(ctx);
        expect(result.masterId).toBe(file);
        expect(['bullish', 'bearish', 'neutral']).toContain(result.signal);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
        expect(result.reasoning).toBeTruthy();
      });

      test('analyze returns neutral on error', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: {
            chat: async () => {
              throw new Error('fail');
            },
          },
        };
        const result = await agent.analyze(ctx);
        expect(result.signal).toBe('neutral');
        expect(result.confidence).toBe(50);
      });
    });
  }
});
