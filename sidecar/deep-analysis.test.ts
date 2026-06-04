import { describe, test, expect, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { runDeepAnalysis, concurrencyForProvider } from './deep-analysis';
import { createMockQuantBundle, createMockNews } from '../shared/test-utils';
import type { ChatProvider } from './agents/types';

const mockQuant = createMockQuantBundle();
const mockNews = [createMockNews({ title: 'Good news', source: 'Reuters' })];

/** 计数型 chat 桩：记录 LLM 被调用次数，用于验证缓存命中时是否跳过调用 */
function countingChat(): { provider: ChatProvider; calls: () => number } {
  let calls = 0;
  const provider: ChatProvider = {
    chat: async () => {
      calls++;
      return JSON.stringify({
        signal: 'bullish', confidence: 70, reasoning: 'x',
        items: [{ index: 1, sentiment: 'positive' }], overall: 'positive',
        summary: 's', consensus: 80,
      });
    },
  };
  return { provider, calls: () => calls };
}

// 返回所有角色都能消费的通用 JSON
function happyChat(): ChatProvider {
  return {
    chat: async () => JSON.stringify({
      signal: 'bullish', confidence: 75, reasoning: '看好',
      items: [{ index: 1, sentiment: 'positive' }], overall: 'positive',
      summary: '综合看好', consensus: 85,
    }),
  };
}

describe('runDeepAnalysis', () => {
  test('happy path: masterSignals + sentiment + synthesis', async () => {
    const result = await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: happyChat(),
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });
    expect(result.masterSignals).toHaveLength(2);
    expect(result.masterSignals[0].masterId).toBe('warren-buffett');
    expect(result.masterSignals[1].masterId).toBe('ben-graham');
    expect(result.sentiment).toHaveProperty('newsBreakdown');
    expect(['bullish', 'bearish', 'neutral']).toContain(result.synthesis.signal);
    expect(result.synthesis.consensus).toBeGreaterThanOrEqual(0);
  });

  test('invalid selectedMasters falls back to DEFAULT_MASTER_IDS', async () => {
    const result = await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: happyChat(),
      selectedMasters: ['nonexistent-master-1', 'nonexistent-master-2'],
    });
    // 回退到默认列表，至少 1 位大师
    expect(result.masterSignals.length).toBeGreaterThan(0);
    expect(result.synthesis).toHaveProperty('signal');
  });

  test('all LLM calls fail → graceful degradation with neutral signals', async () => {
    const failChat: ChatProvider = {
      chat: async () => { throw new Error('LLM unavailable'); },
    };
    const result = await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: failChat,
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });
    // 每个大师应返回 neutral 信号
    expect(result.masterSignals).toHaveLength(2);
    for (const s of result.masterSignals) {
      expect(s.signal).toBe('neutral');
      expect(s.confidence).toBe(50);
    }
    // 情绪分析也应返回 neutral
    expect(result.sentiment.signal).toBe('neutral');
    // 综合研判仍然产出有效结构
    expect(['bullish', 'bearish', 'neutral']).toContain(result.synthesis.signal);
    expect(result.synthesis.summary).toBeTruthy();
  });

  test('concurrency 限制大师并发峰值', async () => {
    let active = 0;
    let peak = 0;
    const trackingChat: ChatProvider = {
      chat: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(r => setTimeout(r, 5));
        active--;
        return JSON.stringify({
          signal: 'neutral', confidence: 50, reasoning: 'x',
          items: [], overall: 'neutral', summary: 's', consensus: 50,
        });
      },
    };
    // 6 位大师 + 情绪分析共用 chat；concurrency=2 时峰值不应超过 2(大师) + 1(情绪并行)
    await runDeepAnalysis({
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: trackingChat,
      selectedMasters: ['warren-buffett', 'ben-graham', 'charlie-munger', 'michael-burry', 'cathie-wood', 'peter-lynch'],
      concurrency: 2,
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('runDeepAnalysis 结果缓存', () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'stockai-da-cache-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('相同输入二次调用命中缓存，跳过全部大师/情绪/综合 LLM 调用', async () => {
    const c = countingChat();
    const opts = {
      symbol: 'AAPL', quant: mockQuant, news: mockNews, chat: c.provider,
      selectedMasters: ['warren-buffett', 'ben-graham'],
      cacheFingerprint: 'openai:gpt-4o', cache: { dir },
    };
    const first = await runDeepAnalysis(opts);
    const afterFirst = c.calls();
    expect(afterFirst).toBeGreaterThan(0);

    const second = await runDeepAnalysis(opts);
    expect(c.calls()).toBe(afterFirst); // 第二次零新增 LLM 调用
    expect(second).toEqual(first); // 命中结果与首次一致
  });

  test('不传 cacheFingerprint 时禁用缓存（每次都重跑）', async () => {
    const c = countingChat();
    const opts = {
      symbol: 'TSLA', quant: mockQuant, news: mockNews, chat: c.provider,
      selectedMasters: ['warren-buffett'], cache: { dir },
    };
    await runDeepAnalysis(opts);
    const afterFirst = c.calls();
    await runDeepAnalysis(opts);
    expect(c.calls()).toBeGreaterThan(afterFirst); // 无指纹 → 第二次仍调用 LLM
  });
});

describe('concurrencyForProvider', () => {
  test('ollama 走低并发（本地单机防排队/OOM）', () => {
    expect(concurrencyForProvider('ollama')).toBe(2);
  });

  test('云端 provider 走高并发', () => {
    for (const p of ['openai', 'anthropic', 'deepseek', 'glm']) {
      expect(concurrencyForProvider(p)).toBe(8);
    }
  });
});
