import { describe, test, expect } from 'bun:test';
import { createChatProvider } from './chat-adapter';

describe('createChatProvider', () => {
  test('returns a ChatProvider with chat method', () => {
    const provider = createChatProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    expect(provider).toHaveProperty('chat');
    expect(typeof provider.chat).toBe('function');
  });

  // 同时守住 ResolvedRole.model → completion 的 model 字段这一映射：角色配置里的模型 id
  // 若没送达补全请求，会静默跑在 provider 的默认模型上（不报错、只是用错模型），必须断言。
  test('chat sends system and user messages with the role model, returns content', async () => {
    const calls: { model: string; messages: Array<{ role: string; content: string }> }[] = [];
    const provider = createChatProvider(
      { provider: 'openai', apiKey: 'k', baseUrl: 'http://x', model: 'gpt-4o-mini' },
      {
        createCompletion: async (opts) => {
          calls.push({ model: opts.model, messages: opts.messages });
          return { choices: [{ message: { content: '{"signal":"bullish"}' } }] };
        },
      },
    );
    const result = await provider.chat('sys', 'usr');
    expect(result).toBe('{"signal":"bullish"}');
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('gpt-4o-mini');
    expect(calls[0].messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });
});
