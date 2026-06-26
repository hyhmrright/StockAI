import OpenAI from 'openai';
import type { ChatProvider } from './types';
import { PROVIDER_PROFILES } from '../../shared/constants';
import type { ProviderType } from '../../shared/types';
import { logger } from '../utils';

interface ChatConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

interface CompletionDep {
  createCompletion: (opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string };
  }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
}

export function createChatProvider(config: ChatConfig, dep?: CompletionDep): ChatProvider {
  const client = dep ?? createOpenAIClient(config);

  return {
    async chat(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await client.createCompletion({
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) logger.warn('LLM 返回空内容，使用空对象降级');
      return content || '{}';
    },
  };
}

function createOpenAIClient(config: ChatConfig): CompletionDep {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    async createCompletion(opts) {
      const profile =
        PROVIDER_PROFILES[config.provider as ProviderType] ?? PROVIDER_PROFILES.openai;
      const response = await client.chat.completions.create(
        {
          model: opts.model,
          messages: opts.messages as OpenAI.ChatCompletionMessageParam[],
          response_format:
            opts.response_format as OpenAI.ChatCompletionCreateParams['response_format'],
        },
        { timeout: profile.timeout },
      );
      if (!response.choices?.length) throw new Error('LLM 返回空 choices');
      return { choices: [{ message: { content: response.choices[0].message.content || '{}' } }] };
    },
  };
}
