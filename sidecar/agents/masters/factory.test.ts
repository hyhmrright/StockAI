import { describe, test, expect } from 'bun:test';
import { createMasterAgent, PARSE_FAIL_MSG, SERVICE_UNAVAIL_MSG } from './factory';
import { createMockQuantBundle, createMockNews } from '../../../shared/test-utils';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

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
