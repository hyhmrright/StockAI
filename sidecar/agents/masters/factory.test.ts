import { describe, test, expect } from 'bun:test';
import { createMasterAgent } from './factory';
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

function makeCtx(chatFn: (s: string, u: string) => Promise<string>): MasterAnalysisContext {
  return {
    symbol: 'AAPL',
    quant: createMockQuantBundle(),
    news: [createMockNews()],
    chat: { chat: chatFn },
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
    expect(result.reasoning).toBe('响应解析失败');
  });

  test('LLM 抛错 → neutral 回退并含"暂不可用"', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => { throw new Error('network timeout'); });
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toContain('分析服务暂不可用');
  });
});
