import { describe, test, expect } from 'bun:test';
import { createChatProvider } from './chat-adapter';

describe('createChatProvider', () => {
  test('returns a ChatProvider with chat method', () => {
    const provider = createChatProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
    });
    expect(provider).toHaveProperty('chat');
    expect(typeof provider.chat).toBe('function');
  });

  test('chat sends system and user messages and returns content', async () => {
    const calls: unknown[] = [];
    const provider = createChatProvider(
      { provider: 'openai', apiKey: 'k', baseUrl: 'http://x', modelName: 'm' },
      {
        createCompletion: async (opts: unknown) => {
          calls.push(opts);
          return { choices: [{ message: { content: '{"signal":"bullish"}' } }] };
        },
      },
    );
    const result = await provider.chat('sys', 'usr');
    expect(result).toBe('{"signal":"bullish"}');
    expect(calls).toHaveLength(1);
  });
});
