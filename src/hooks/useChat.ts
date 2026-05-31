import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatContext, ChatPayload, ChatResponse } from "../../shared/types";
import { chat as ipcChat } from "../lib/ipc";

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
 */
export function useChat(symbol: string, context: ChatContext, runner: ChatFn = ipcChat): UseChatResult {
  const historyRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, force] = useState(0);

  const messages = historyRef.current.get(symbol) ?? [];

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!symbol || !q || sending) return;

    const prev = historyRef.current.get(symbol) ?? [];
    const userMsg: ChatMessage = { role: "user", content: q };
    historyRef.current.set(symbol, [...prev, userMsg]);
    setError(null);
    setSending(true);
    force(n => n + 1);

    try {
      // history 传不含本次问题的历史；question 单独传，由 sidecar 拼成 user 末条
      const { reply } = await runner({ symbol, question: q, history: prev, context });
      const botMsg: ChatMessage = { role: "assistant", content: reply };
      historyRef.current.set(symbol, [...prev, userMsg, botMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      force(n => n + 1);
    }
  }, [symbol, sending, context, runner]);

  const reset = useCallback(() => {
    historyRef.current.delete(symbol);
    setError(null);
    force(n => n + 1);
  }, [symbol]);

  return { messages, sending, error, ask, reset };
}
