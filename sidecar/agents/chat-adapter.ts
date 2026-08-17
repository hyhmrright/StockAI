import OpenAI from 'openai';
import type { ChatProvider } from './types';
import { PROVIDER_PROFILES } from '../../shared/constants';
import type { ResolvedRole } from '../configResolver';
import { logger } from '../log';

interface CompletionDep {
  createCompletion: (opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string };
  }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
}

export function createChatProvider(config: ResolvedRole, dep?: CompletionDep): ChatProvider {
  const client = dep ?? createOpenAIClient(config);

  return {
    async chat(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await client.createCompletion({
        model: config.model,
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

function createOpenAIClient(config: ResolvedRole): CompletionDep {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    async createCompletion(opts) {
      // provider 已由 resolveConfig 校验必为 PROVIDER_PROFILES 的键，无需再兜底
      const profile = PROVIDER_PROFILES[config.provider];
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
