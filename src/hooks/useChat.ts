import { useCallback } from 'react';
import type { ChatMessage, ChatContext, ChatPayload, ChatResponse } from '../../shared/types';
import { chat as ipcChat } from '../lib/ipc';
import { useSymbolScopedAsync } from './useSymbolScopedAsync';

export interface UseChatResult {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}

type ChatFn = (payload: ChatPayload) => Promise<ChatResponse>;

/**
 * 对话式追问 hook：按 symbol 隔离多轮历史。
 * context 由调用方（Dashboard）从当前新闻/量化/已有分析精简构造，作为每轮的事实底座。
 *
 * 历史、sending、error 全部经 useSymbolScopedAsync 按 symbol 分桶——切股票时不会
 * 串台，历史 Map 也随之获得 LRI 限容（此前两者都缺）。
 */
export function useChat(
  symbol: string,
  context: ChatContext,
  runner: ChatFn = ipcChat,
): UseChatResult {
  const store = useSymbolScopedAsync<ChatMessage[]>();
  const messages = store.get(symbol) ?? [];

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!symbol || !q || store.isRunning(symbol)) return;

      const prev = store.get(symbol) ?? [];
      const userMsg: ChatMessage = { role: 'user', content: q };
      // 乐观追加：提问先上屏，回答到达后再补 assistant 消息
      store.set(symbol, [...prev, userMsg]);

      await store.run(symbol, async () => {
        // history 传不含本次问题的历史；question 单独传，由 sidecar 拼成 user 末条
        const { reply, citations } = await runner({ symbol, question: q, history: prev, context });
        // citations 随消息持久化，多轮历史里角标不丢失
        const botMsg: ChatMessage = { role: 'assistant', content: reply, citations };
        return [...prev, userMsg, botMsg];
      });
    },
    [symbol, context, runner, store],
  );

  const reset = useCallback(() => store.remove(symbol), [symbol, store]);

  return {
    messages,
    sending: store.isRunning(symbol),
    error: store.errorOf(symbol),
    ask,
    reset,
  };
}
