import type { PriceLevel, ValuationSnapshot } from '../../shared/types';
import type { SubSignal } from './types';

/** 止损相对现价的 ATR 倍数 */
const STOP_LOSS_ATR_MULT = 2;

/** 从子信号数组按名取数值型 detail；缺失或非有限值返回 null */
function numDetail(subSignals: SubSignal[], name: string, key: string): number | null {
  const v = subSignals.find((s) => s.name === name)?.details[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 从已算出的量化中间量推导 K 线关键价位线（最多 4 条），纯函数、无网络。
 * - support：BOLL 下轨（mean_reversion 已算）
 * - resistance：BOLL 上轨（mean_reversion 已算）
 * - target：现价 ×(1+安全边际)，与股本无关的每股目标价（valuation.marginOfSafety）
 * - stopLoss：现价 −2×ATR（volatility 已算），须落在 (0, lastClose) 内
 * 缺某维或数值非法时静默跳过该条（前端 guard 不画），产出天然 ≤ 4 条，可为空。
 */
export function deriveLevels(
  subSignals: SubSignal[],
  valuation: ValuationSnapshot | null,
  lastClose: number,
): PriceLevel[] {
  const levels: PriceLevel[] = [];
  // 现价基准非法时无从推导任何相对价位，直接返回空
  if (!Number.isFinite(lastClose) || lastClose <= 0) return levels;

  const bbLower = numDetail(subSignals, 'mean_reversion', 'bb_lower');
  if (bbLower != null) levels.push({ price: bbLower, type: 'support', source: 'boll_lower' });

  const bbUpper = numDetail(subSignals, 'mean_reversion', 'bb_upper');
  if (bbUpper != null) levels.push({ price: bbUpper, type: 'resistance', source: 'boll_upper' });

  // 目标价用安全边际隐含每股价，避免引入 sharesOutstanding 新口径
  const mos = valuation?.marginOfSafety;
  if (mos != null && Number.isFinite(mos)) {
    const target = lastClose * (1 + mos);
    if (target > 0) levels.push({ price: target, type: 'target', source: 'valuation' });
  }

  const atr = numDetail(subSignals, 'volatility', 'atr');
  if (atr != null && atr > 0) {
    const stop = lastClose - STOP_LOSS_ATR_MULT * atr;
    if (stop > 0 && stop < lastClose) {
      levels.push({ price: stop, type: 'stopLoss', source: 'atr' });
    }
  }

  return levels;
}
