import { describe, test, expect } from 'bun:test';
import {
  computeConsensus,
  synthesize,
  computeLocalSynthesis,
  buildSynthesisPrompt,
  FALLBACK_SUMMARY,
} from './synthesizer';
import { computeMasterWeights } from './weights';
import type {
  MasterSignal,
  SentimentSignal,
  QuantBundle,
  MasterWeightInput,
} from '../../shared/types';
import type { ChatProvider } from './types';

const bullishSignal = (id: string, conf = 80): MasterSignal => ({
  masterId: id,
  signal: 'bullish',
  confidence: conf,
  reasoning: '看好',
});
const bearishSignal = (id: string, conf = 70): MasterSignal => ({
  masterId: id,
  signal: 'bearish',
  confidence: conf,
  reasoning: '看衰',
});

describe('computeConsensus', () => {
  test('all bullish → 100', () => {
    expect(computeConsensus([bullishSignal('a'), bullishSignal('b'), bullishSignal('c')])).toBe(
      100,
    );
  });
  test('mixed → between 50-100', () => {
    const c = computeConsensus([bullishSignal('a'), bearishSignal('b'), bullishSignal('c')]);
    expect(c).toBeGreaterThan(50);
    expect(c).toBeLessThan(100);
  });
  test('empty → 0', () => {
    expect(computeConsensus([])).toBe(0);
  });
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
    signal: 'bullish',
    confidence: 70,
    newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
  };

  test('calls LLM and returns DeepAnalysisResult', async () => {
    const masters = [bullishSignal('warren-buffett'), bullishSignal('ben-graham')];
    const chat: ChatProvider = {
      chat: async () =>
        JSON.stringify({ signal: 'bullish', confidence: 82, summary: '综合看好', consensus: 95 }),
    };
    const r = await synthesize(masters, mockSentiment, mockQuant, chat);
    expect(r.masterSignals).toEqual(masters);
    expect(r.sentiment).toEqual(mockSentiment);
    expect(r.synthesis.signal).toBe('bullish');
    expect(r.synthesis.summary).toBe('综合看好');
  });

  test('falls back to local computation on LLM failure', async () => {
    const masters = [bullishSignal('a', 90), bearishSignal('b', 60), bullishSignal('c', 80)];
    const r = await synthesize(masters, mockSentiment, mockQuant, {
      chat: async () => {
        throw new Error('fail');
      },
    });
    expect(r.synthesis.signal).toBe('bullish');
    expect(r.synthesis.consensus).toBeGreaterThan(50);
    expect(r.synthesis.summary).toBe(FALLBACK_SUMMARY['zh'](masters.length, 2, 1, 'bullish'));
  });

  test('language=en: fallback summary 使用英文', async () => {
    const masters = [bullishSignal('a', 90), bearishSignal('b', 60)];
    const r = await synthesize(
      masters,
      mockSentiment,
      mockQuant,
      {
        chat: async () => {
          throw new Error('fail');
        },
      },
      'en',
    );
    expect(r.synthesis.summary).toContain('analysts');
    expect(r.synthesis.summary).not.toContain('大师');
  });
});

// 弱战绩看涨 vs 强战绩看跌：不加权→bullish，加权→bearish（方向翻转）
const FLIP_SIGNALS: MasterSignal[] = [
  { masterId: 'bull1', signal: 'bullish', confidence: 50, reasoning: '' },
  { masterId: 'bull2', signal: 'bullish', confidence: 50, reasoning: '' },
  { masterId: 'bear1', signal: 'bearish', confidence: 70, reasoning: '' },
];
const FLIP_WEIGHTS: MasterWeightInput[] = [
  { masterId: 'bull1', sampleSize: 30, hits: 6 }, // 弱战绩 → 权重 ~0.775
  { masterId: 'bull2', sampleSize: 30, hits: 6 },
  { masterId: 'bear1', sampleSize: 30, hits: 24 }, // 强战绩 → 权重 ~1.225
];
const throwingChat: ChatProvider = {
  chat: async () => {
    throw new Error('fail');
  },
};
const mockSentiment: SentimentSignal = {
  signal: 'bullish',
  confidence: 70,
  newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
};
const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: { signal: 'bullish', confidence: 70, details: {} },
  fundamental: { signal: 'neutral', confidence: 55, details: {} },
  composite: { signal: 'bullish', score: 65 },
  fetchedAt: Date.now(),
};

describe('computeLocalSynthesis 加权', () => {
  test('无 weights → 与今天逐字节一致（默认全 1）', () => {
    const noArg = computeLocalSynthesis(FLIP_SIGNALS);
    const emptyMap = computeLocalSynthesis(FLIP_SIGNALS, new Map());
    expect(emptyMap).toEqual(noArg);
    expect(noArg.signal).toBe('bullish'); // 50+50 > 70
  });

  test('加权后方向翻转：2 弱战绩看涨 → 1 强战绩看跌', () => {
    const weights = computeMasterWeights(FLIP_WEIGHTS);
    const weighted = computeLocalSynthesis(FLIP_SIGNALS, weights);
    expect(weighted.signal).toBe('bearish');
  });

  test('未达阈值大师权重按 1 处理，不影响结果', () => {
    // 全部样本不足 → 空 Map → 等价于不加权
    const weights = computeMasterWeights([
      { masterId: 'bull1', sampleSize: 3, hits: 0 },
      { masterId: 'bull2', sampleSize: 3, hits: 0 },
      { masterId: 'bear1', sampleSize: 3, hits: 3 },
    ]);
    expect(weights.size).toBe(0);
    expect(computeLocalSynthesis(FLIP_SIGNALS, weights).signal).toBe('bullish');
  });
});

describe('synthesize 端到端加权（兜底路径）', () => {
  test('不传 weights → bullish；传 flip weights → bearish', async () => {
    const noWeights = await synthesize(FLIP_SIGNALS, mockSentiment, mockQuant, throwingChat, 'zh');
    expect(noWeights.synthesis.signal).toBe('bullish');

    const weighted = await synthesize(
      FLIP_SIGNALS,
      mockSentiment,
      mockQuant,
      throwingChat,
      'zh',
      FLIP_WEIGHTS,
    );
    expect(weighted.synthesis.signal).toBe('bearish');
  });
});

describe('buildSynthesisPrompt 战绩标注', () => {
  test('达阈值大师行末追加命中率+权重；未达阈值不标注', () => {
    const signals = [bullishSignal('warren-buffett'), bullishSignal('rookie')];
    const weights = computeMasterWeights([
      { masterId: 'warren-buffett', sampleSize: 30, hits: 24 },
    ]);
    const prompt = buildSynthesisPrompt(signals, mockSentiment, mockQuant, 'zh', weights);
    // 24/30 = 80%
    expect(prompt).toContain('历史命中率 80%');
    expect(prompt).toContain('权重 1.2');
    // 未达阈值 master 不在 Map → 无标注（全文仅一处命中率标注）
    expect(prompt.match(/历史命中率/g)?.length).toBe(1);
  });

  test('无 weights → prompt 不含任何战绩标注（向后兼容）', () => {
    const signals = [bullishSignal('warren-buffett')];
    const prompt = buildSynthesisPrompt(signals, mockSentiment, mockQuant, 'zh');
    expect(prompt).not.toContain('历史命中率');
  });

  test('en/ja 标注使用对应语言标签（不夹带中文）', () => {
    const signals = [bullishSignal('warren-buffett')];
    const weights = computeMasterWeights([
      { masterId: 'warren-buffett', sampleSize: 30, hits: 24 },
    ]);
    const en = buildSynthesisPrompt(signals, mockSentiment, mockQuant, 'en', weights);
    expect(en).toContain('Hit rate 80%');
    expect(en).not.toContain('历史命中率');
    const ja = buildSynthesisPrompt(signals, mockSentiment, mockQuant, 'ja', weights);
    expect(ja).toContain('的中率 80%');
  });
});
