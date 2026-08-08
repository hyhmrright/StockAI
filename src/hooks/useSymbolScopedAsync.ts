import { useRef, useState } from 'react';
import { MAX_SYMBOLS_IN_CACHE, setWithLRI } from './cache-utils';

/**
 * 按 key（通常是 symbol，或 symbol+配置指纹）分桶的异步结果仓库。
 * 所有状态存在 ref 里、对象引用恒定，调用方可放心把它写进 useCallback 依赖。
 */
export interface SymbolScopedStore<T> {
  get(key: string): T | null;
  /** 写结果（LRI 限容 + 触发重渲染） */
  set(key: string, value: T): void;
  /** 清掉某 key 的结果与错误 */
  remove(key: string): void;
  errorOf(key: string): string | null;
  setError(key: string, message: string): void;
  isRunning(key: string): boolean;
  /**
   * 跑一次异步任务：按 key 做竞态守卫，成功写结果、失败写错误。
   * task 返回 undefined 表示「本次不覆盖已有结果」（如只做副作用）。
   */
  run(key: string, task: () => Promise<T | void>): Promise<void>;
}

/**
 * per-symbol 异步状态的统一实现。
 *
 * 为什么要有它：AI 分析 / 深度分析 / 对话追问都需要「按 symbol 隔离结果、隔离 error、
 * 隔离 in-flight，并防跨 symbol 竞态」。这套逻辑此前在三个 hook 里各抄了一份，
 * 已经漂移出真实缺陷（对话的 sending/error 漏了按 symbol 隔离、历史 Map 漏了限容）。
 *
 * 不变量（三处共用，改这里即三处同步生效）：
 * - 切到别的 symbol 时看不到上一只的 error / analyzing 状态
 * - 同一 key 并发多次请求时只有最新一次能落盘
 * - 结果与错误都按 MAX_SYMBOLS_IN_CACHE 限容，长会话不会无界增长
 */
export function useSymbolScopedAsync<T>(capacity = MAX_SYMBOLS_IN_CACHE): SymbolScopedStore<T> {
  const dataRef = useRef<Map<string, T>>(new Map());
  const errorRef = useRef<Map<string, string>>(new Map());
  const runningRef = useRef<Set<string>>(new Set());
  const reqIdRef = useRef<Map<string, number>>(new Map());
  const [, force] = useState(0);
  const storeRef = useRef<SymbolScopedStore<T> | null>(null);

  if (!storeRef.current) {
    const rerender = () => force((n) => n + 1);
    storeRef.current = {
      get: (key) => dataRef.current.get(key) ?? null,
      set: (key, value) => {
        setWithLRI(dataRef.current, key, value, capacity);
        rerender();
      },
      remove: (key) => {
        dataRef.current.delete(key);
        errorRef.current.delete(key);
        rerender();
      },
      errorOf: (key) => errorRef.current.get(key) ?? null,
      setError: (key, message) => {
        setWithLRI(errorRef.current, key, message, capacity);
        rerender();
      },
      isRunning: (key) => runningRef.current.has(key),
      run: async (key, task) => {
        const myReqId = (reqIdRef.current.get(key) ?? 0) + 1;
        reqIdRef.current.set(key, myReqId);
        runningRef.current.add(key);
        errorRef.current.delete(key);
        rerender();

        try {
          const value = await task();
          if (reqIdRef.current.get(key) !== myReqId) return;
          if (value !== undefined) setWithLRI(dataRef.current, key, value as T, capacity);
        } catch (err) {
          if (reqIdRef.current.get(key) !== myReqId) return;
          const message = err instanceof Error ? err.message : String(err);
          setWithLRI(errorRef.current, key, message, capacity);
        } finally {
          // 仅当本次仍是该 key 的最新请求才收尾；stale 请求没写任何状态，跳过 rerender 省一次空渲染
          if (reqIdRef.current.get(key) === myReqId) {
            runningRef.current.delete(key);
            rerender();
          }
        }
      },
    };
  }

  return storeRef.current;
}
