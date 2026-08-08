import { useEffect, useMemo, useState } from 'react';
import { fetchRealtimeQuotes } from '../lib/ipc';
import { detectMarket, isTradingHours } from '../lib/market-hours';
import type { BatchQuoteResult } from '../../shared/types';

const POLL_MS = 10_000;

/**
 * 一组标的的实时报价轮询——关注列表、价格告警、持仓盈亏共用一份数据。
 *
 * 与 useSymbolFetch / useSymbolScopedAsync 的分工：那两个是「按单个 symbol 取数」，
 * 这里的入参本身就是一组，且要长期轮询，不是一次性取数。
 *
 * 三条与单股 useRealtimeQuote 一致的规矩：
 *  - 首次立即拉一次（不看交易时段），好给出「最后已知价格」
 *  - 之后每 tick 只拉**当前处于交易时段**的那些标的。北京时间上午轮询美股是纯浪费，
 *    而按市场分别判断比整组一刀切更准
 *  - 结果**合并**进已有报价而非整体替换：本轮没取的标的要保留上一次的价，
 *    否则收盘的那半边会在第一次 tick 后集体变空
 */
export function useQuotes(symbols: string[]): BatchQuoteResult {
  // 数组入参每次渲染都是新引用，直接进 deps 会让 effect 每帧重启。
  // 排序 + 去重后拼成字符串当 key：关注列表拖动排序不该重启轮询。
  const key = useMemo(() => [...new Set(symbols)].sort().join(','), [symbols]);
  const [state, setState] = useState<BatchQuoteResult>({ quotes: {}, failed: [] });

  useEffect(() => {
    const all = key ? key.split(',') : [];
    if (all.length === 0) {
      setState({ quotes: {}, failed: [] });
      return;
    }

    let active = true;

    async function load(targets: string[]) {
      if (targets.length === 0) return;
      // 整批抛出即数据源全挂，此时这批全部记为失败——比静静保留旧价诚实
      const result = await fetchRealtimeQuotes(targets).catch(
        (): BatchQuoteResult => ({ quotes: {}, failed: targets }),
      );
      if (!active) return;
      setState((prev) => {
        // 本轮涉及的标的先从旧 failed 里摘掉，再并入本轮的失败，避免失败标记永久粘住
        const failed = new Set(prev.failed.filter((s) => !targets.includes(s)));
        for (const s of result.failed) failed.add(s);
        return { quotes: { ...prev.quotes, ...result.quotes }, failed: [...failed] };
      });
    }

    void load(all);
    const timer = setInterval(
      () => void load(all.filter((s) => isTradingHours(detectMarket(s)))),
      POLL_MS,
    );

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key]);

  return state;
}
