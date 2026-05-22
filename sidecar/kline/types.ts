import type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode } from "../../shared/types";

export type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode };

/**
 * Sidecar 内部规范化的参数：路由层把用户原始 symbol 转成各源能识别的形式
 */
export interface NormalizedRequest {
  rawSymbol: string;
  period: KlinePeriod;
  range: KlineRange;
  adjust: AdjustMode;
  market: "A股" | "美股";
}
