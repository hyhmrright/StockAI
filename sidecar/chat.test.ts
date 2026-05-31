import { describe, test, expect } from 'bun:test';
import { buildChatMessages, runChat } from './chat';
import type { ChatPayload } from '../shared/types';

function makePayload(over: Partial<ChatPayload> = {}): ChatPayload {
  return { symbol: 'AAPL', question: '它的护城河如何？', history: [], context: {}, ...over };
}

describe('buildChatMessages', () => {
  test('首条为 system 含 symbol，末条为本次问题', () => {
    const msgs = buildChatMessages(makePayload());
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('AAPL');
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: '它的护城河如何？' });
  });

  test('注入新闻/量化/分析上下文', () => {
    const msgs = buildChatMessages(makePayload({
      context: { newsTitles: ['财报超预期'], quantSummary: '综合 72/100', analysisSummary: '看涨' },
    }));
    const sys = msgs[0].content;
    expect(sys).toContain('财报超预期');
    expect(sys).toContain('72/100');
    expect(sys).toContain('看涨');
  });

  test('空上下文 → 提示暂无额外上下文', () => {
    expect(buildChatMessages(makePayload())[0].content).toContain('暂无额外上下文');
  });

  test('保留多轮历史顺序', () => {
    const msgs = buildChatMessages(makePayload({
      history: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }],
    }));
    expect(msgs).toHaveLength(4); // system + Q1 + A1 + 本次问题
    expect(msgs[1]).toEqual({ role: 'user', content: 'Q1' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'A1' });
  });

  test('language=en：system 用英文指令', () => {
    expect(buildChatMessages(makePayload(), 'en')[0].content).toContain('in English');
  });

  test('language=ja：system 为日文且无西里尔字母混入', () => {
    const sys = buildChatMessages(makePayload(), 'ja')[0].content;
    expect(sys).toContain('日本語で回答');
    expect(sys).toContain('財務データ');
    expect(/[Ѐ-ӿ]/.test(sys)).toBe(false); // 不含西里尔字母
  });
});

describe('runChat', () => {
  test('DI dep 注入时直接返回其结果', async () => {
    const reply = await runChat(
      { provider: 'openai', apiKey: 'k', baseUrl: 'u', modelName: 'm' },
      [{ role: 'user', content: 'hi' }],
      { complete: async (msgs) => `echo:${msgs[msgs.length - 1].content}` },
    );
    expect(reply).toBe('echo:hi');
  });
});
