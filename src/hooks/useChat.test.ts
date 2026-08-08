import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from './useChat';
import { ServiceError } from '../lib/service-errors';
import type { ChatContext, ChatResponse } from '../../shared/types';

const CTX: ChatContext = { newsTitles: ['t1'] };

/** 手动控制 resolve 时机的 runner，便于断言 in-flight 状态 */
function deferredRunner() {
  let resolve!: (r: ChatResponse) => void;
  const runner = vi.fn(
    () =>
      new Promise<ChatResponse>((r) => {
        resolve = r;
      }),
  );
  return { runner, resolve: (r: ChatResponse) => resolve(r) };
}

describe('useChat', () => {
  it('提问先乐观上屏，回答到达后补 assistant 消息', async () => {
    const runner = vi.fn().mockResolvedValue({ reply: '答案', citations: [] });
    const { result } = renderHook(() => useChat('600519', CTX, runner));

    await act(async () => {
      await result.current.ask('问题');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: '问题' });
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: '答案' });
  });

  // 回归保护：sending 曾是普通 useState（全局），切股票时会把别的标的显示成「回答中」
  it('sending 按 symbol 隔离：A 股在跑时切到 B 股不显示回答中', async () => {
    const { runner, resolve } = deferredRunner();
    const { result, rerender } = renderHook(({ s }) => useChat(s, CTX, runner), {
      initialProps: { s: '600519' },
    });

    act(() => {
      void result.current.ask('问题');
    });
    await waitFor(() => expect(result.current.sending).toBe(true));

    rerender({ s: '000858' });
    expect(result.current.sending).toBe(false);

    await act(async () => {
      resolve({ reply: '答案' });
    });
  });

  // 回归保护：error 曾是普通 useState（全局），A 股失败后切到 B 股仍显示 A 股的报错
  it('error 按 symbol 隔离：A 股失败后切到 B 股不残留错误', async () => {
    const runner = vi.fn().mockRejectedValue(new ServiceError('ERR_CHAT', '网络炸了'));
    const { result, rerender } = renderHook(({ s }) => useChat(s, CTX, runner), {
      initialProps: { s: '600519' },
    });

    await act(async () => {
      await result.current.ask('问题');
    });
    expect(result.current.error).toContain('网络炸了');

    rerender({ s: '000858' });
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it('多轮历史按 symbol 分桶，切回原标的仍在', async () => {
    const runner = vi.fn().mockResolvedValue({ reply: 'A答' });
    const { result, rerender } = renderHook(({ s }) => useChat(s, CTX, runner), {
      initialProps: { s: '600519' },
    });

    await act(async () => {
      await result.current.ask('A问');
    });
    rerender({ s: '000858' });
    expect(result.current.messages).toEqual([]);

    rerender({ s: '600519' });
    expect(result.current.messages).toHaveLength(2);
  });

  it('失败时保留已上屏的提问（用户能看到自己问了什么）', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useChat('600519', CTX, runner));

    await act(async () => {
      await result.current.ask('问题');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
  });

  it('reset 清空当前 symbol 的历史与错误', async () => {
    const runner = vi.fn().mockResolvedValue({ reply: '答案' });
    const { result } = renderHook(() => useChat('600519', CTX, runner));

    await act(async () => {
      await result.current.ask('问题');
    });
    act(() => result.current.reset());

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('空问题 / 空 symbol 不发请求', async () => {
    const runner = vi.fn().mockResolvedValue({ reply: 'x' });
    const { result } = renderHook(() => useChat('', CTX, runner));
    await act(async () => {
      await result.current.ask('问题');
    });

    const { result: r2 } = renderHook(() => useChat('600519', CTX, runner));
    await act(async () => {
      await r2.current.ask('   ');
    });

    expect(runner).not.toHaveBeenCalled();
  });

  it('同一 symbol 请求进行中时忽略重复提问', async () => {
    const { runner, resolve } = deferredRunner();
    const { result } = renderHook(() => useChat('600519', CTX, runner));

    act(() => {
      void result.current.ask('第一问');
    });
    await waitFor(() => expect(result.current.sending).toBe(true));
    await act(async () => {
      await result.current.ask('第二问');
    });

    expect(runner).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ reply: '答案' });
    });
  });
});
