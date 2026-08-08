import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { registerQuotes, getQuotesSnapshot, subscribeQuotes } from '../lib/quotes-store';
import type { BatchQuoteResult } from '../../shared/types';

/**
 * 订阅一组标的的实时报价——关注列表、持仓、指数条共用。
 *
 * 本 hook 自己不轮询：定时器与请求都在 lib/quotes-store.ts 的单例里，全应用只有一个。
 * 多处调用只是往并集里添代码，不会成倍放大 sidecar 进程数（那正是这次收敛要消灭的）。
 *
 * 返回的是整份快照，调用方按自己手里的代码查表；`failed` 同理，用 includes 判断。
 */
export function useQuotes(symbols: string[]): BatchQuoteResult {
  // 数组入参每次渲染都是新引用，直接进 deps 会让订阅每帧重建。
  // 排序去重后拼成字符串当 key：关注列表拖动排序不该触发重订阅。
  const key = useMemo(() => [...new Set(symbols)].sort().join(','), [symbols]);

  useEffect(() => {
    if (!key) return;
    return registerQuotes(key.split(','));
  }, [key]);

  return useSyncExternalStore(subscribeQuotes, getQuotesSnapshot);
}
