import { describe, test, expect } from 'bun:test';
import { createMasterAgent, formatNewsForPrompt, PARSE_FAIL_MSG, SERVICE_UNAVAIL_MSG } from './factory';
import { createMockQuantBundle, createMockNews } from '../../../shared/test-utils';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta, StockNews } from '../../../shared/types';

function makeNews(title: string, content: string): StockNews {
  return { title, content, source: 'test', date: '2026-05-31', url: 'https://example.com' };
}

const meta: MasterMeta = {
  id: 'test-master',
  name: 'Test Master',
  nameZh: '测试大师',
  style: 'test',
  styleZh: '测试风格',
  description: 'A test master agent',
};

function makeCtx(chatFn: (s: string, u: string) => Promise<string>, language?: 'zh' | 'en' | 'ja'): MasterAnalysisContext {
  return {
    symbol: 'AAPL',
    quant: createMockQuantBundle(),
    news: [createMockNews()],
    chat: { chat: chatFn },
    language,
  };
}

describe('createMasterAgent', () => {
  test('成功响应返回解析后的 signal', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => JSON.stringify({
      signal: 'bearish', confidence: 80, reasoning: '估值过高',
    }));
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('bearish');
    expect(result.confidence).toBe(80);
    expect(result.reasoning).toBe('估值过高');
  });

  test('LLM 返回非法 JSON → neutral 回退', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => 'this is not json at all');
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toBe(PARSE_FAIL_MSG['zh']);
  });

  test('LLM 抛错 → neutral 回退并含"暂不可用"', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => { throw new Error('network timeout'); });
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toBe(SERVICE_UNAVAIL_MSG['zh']);
  });

  test('language=en: 非法 JSON → 英文回退消息', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => 'not json', 'en');
    const result = await agent.analyze(ctx);
    expect(result.reasoning).toBe('Response parse failed');
  });

  test('language=en: LLM 抛错 → 英文服务不可用消息', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => { throw new Error('fail'); }, 'en');
    const result = await agent.analyze(ctx);
    expect(result.reasoning).toBe('Analysis service unavailable');
  });

  test('language=en: system prompt 包含英文语言指令', async () => {
    const agent = createMasterAgent(meta, 'system prompt', () => 'user');
    let capturedSystem = '';
    const ctx = makeCtx(async (s) => { capturedSystem = s; return JSON.stringify({ signal: 'neutral', confidence: 50, reasoning: 'ok' }); }, 'en');
    await agent.analyze(ctx);
    expect(capturedSystem).toContain('Respond in English');
    expect(capturedSystem).not.toContain('用中文回复');
  });
});

describe('formatNewsForPrompt', () => {
  test('有正文：标题后附正文摘要', () => {
    const lines = formatNewsForPrompt([makeNews('利好消息', '公司发布了强劲财报')]);
    expect(lines[0]).toBe('1. 利好消息\n   公司发布了强劲财报');
  });

  test('无正文（空字符串）：仅标题', () => {
    const lines = formatNewsForPrompt([makeNews('仅标题新闻', '')]);
    expect(lines[0]).toBe('1. 仅标题新闻');
  });

  test('正文超长按 bodyChars 截断', () => {
    const lines = formatNewsForPrompt([makeNews('长文', 'x'.repeat(500))], 5, 200);
    // "1. 长文\n   " 前缀 + 200 个 x
    expect(lines[0].endsWith('x'.repeat(200))).toBe(true);
    expect(lines[0]).not.toContain('x'.repeat(201));
  });

  test('超过 maxItems 只取前 N 条并保留序号', () => {
    const news = Array.from({ length: 8 }, (_, i) => makeNews(`新闻${i}`, ''));
    const lines = formatNewsForPrompt(news, 5);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('5. 新闻4');
  });

  test('仅空白的正文视为无正文', () => {
    const lines = formatNewsForPrompt([makeNews('标题', '   \n  ')]);
    expect(lines[0]).toBe('1. 标题');
  });
});
