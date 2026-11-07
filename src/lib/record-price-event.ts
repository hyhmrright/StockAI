import { updateWorkspace } from './research-store';
import type { RealtimeQuote } from '../../shared/types';
/** 同一根报价只落一次触发事件，系统通知失败也能在事件中心回看。 */
export function recordPriceEvent(quote: RealtimeQuote, side: 'upper' | 'lower', limit: number) {
  const id = `price:${quote.symbol}:${side}:${quote.timestamp}`;
  void updateWorkspace((s) =>
    s.events.some((e) => e.id === id)
      ? s
      : {
          ...s,
          events: [
            {
              id,
              symbol: quote.symbol,
              date: new Date(quote.timestamp * 1000).toISOString().slice(0, 10),
              title: `${quote.price} ${side === 'upper' ? '≥' : '≤'} ${limit}`,
              kind: 'price' as const,
              read: false,
            },
            ...s.events,
          ].slice(0, 2000),
        },
  ).catch((e) => console.error('保存价格事件失败', e));
}
