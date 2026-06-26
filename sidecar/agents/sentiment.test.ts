import { describe, test, expect } from 'bun:test';
import { analyzeSentiment, computeSentimentSignal } from './sentiment';
import type { StockNews } from '../../shared/types';
import type { ChatProvider } from './types';

const mockNews: StockNews[] = [
  {
    title: 'Revenue beats expectations',
    source: 'Reuters',
    date: '2026-05-20',
    content: 'Strong growth',
    url: '',
  },
  {
    title: 'CEO under investigation',
    source: 'WSJ',
    date: '2026-05-19',
    content: 'Legal trouble',
    url: '',
  },
  {
    title: 'Market update',
    source: 'Bloomberg',
    date: '2026-05-18',
    content: 'Normal trading',
    url: '',
  },
];

describe('computeSentimentSignal', () => {
  test('computes correct breakdown and signal', () => {
    const items = [
      { index: 1, sentiment: 'positive' as const },
      { index: 2, sentiment: 'negative' as const },
      { index: 3, sentiment: 'neutral' as const },
    ];
    const result = computeSentimentSignal(items);
    expect(result.newsBreakdown.positive).toBe(1);
    expect(result.newsBreakdown.negative).toBe(1);
    expect(result.newsBreakdown.neutral).toBe(1);
    expect(result.newsBreakdown.total).toBe(3);
    expect(result.signal).toBe('neutral');
  });
  test('majority positive → bullish', () => {
    const r = computeSentimentSignal([
      { index: 1, sentiment: 'positive' as const },
      { index: 2, sentiment: 'positive' as const },
      { index: 3, sentiment: 'neutral' as const },
    ]);
    expect(r.signal).toBe('bullish');
  });
  test('majority negative → bearish', () => {
    const r = computeSentimentSignal([
      { index: 1, sentiment: 'negative' as const },
      { index: 2, sentiment: 'negative' as const },
      { index: 3, sentiment: 'positive' as const },
    ]);
    expect(r.signal).toBe('bearish');
  });
});

describe('analyzeSentiment', () => {
  test('calls LLM and parses response', async () => {
    const chat: ChatProvider = {
      chat: async () =>
        JSON.stringify({
          items: [
            { index: 1, sentiment: 'positive' },
            { index: 2, sentiment: 'negative' },
            { index: 3, sentiment: 'neutral' },
          ],
          overall: 'neutral',
        }),
    };
    const r = await analyzeSentiment(mockNews, chat);
    expect(r.newsBreakdown.total).toBe(3);
    expect(r.signal).toBe('neutral');
  });
  test('returns neutral on LLM failure', async () => {
    const r = await analyzeSentiment(mockNews, {
      chat: async () => {
        throw new Error('timeout');
      },
    });
    expect(r.signal).toBe('neutral');
    expect(r.confidence).toBe(50);
    expect(r.newsBreakdown.total).toBe(0);
  });
});
