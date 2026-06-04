import type { MasterSignal } from "../../shared/types";

/** 大师多空分布：把单一共识度数字展开为「N 人中 X 看涨 Y 看跌 Z 中性」+ 占比 */
export interface MasterConsensus {
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  bullishPct: number;
  bearishPct: number;
  neutralPct: number;
}

/** 聚合大师信号为多空分布（纯计算，空数组安全） */
export function computeMasterConsensus(signals: MasterSignal[]): MasterConsensus {
  const total = signals.length;
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const s of signals) {
    if (s.signal === "bullish") bullish++;
    else if (s.signal === "bearish") bearish++;
    else neutral++;
  }
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const bullishPct = pct(bullish);
  const bearishPct = pct(bearish);
  // 中性吸收取整余数，保证三者之和恒为 100（否则占比条会出现 1px 缝隙/溢出）；空数组全 0
  const neutralPct = total > 0 ? Math.max(0, 100 - bullishPct - bearishPct) : 0;
  return { total, bullish, bearish, neutral, bullishPct, bearishPct, neutralPct };
}
