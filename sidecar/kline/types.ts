import type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode } from "../../shared/types";

export type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode };

/** K 线/报价各数据源 fetch 的超时（毫秒）：超时即中止，由多源回退兜底 */
export const KLINE_FETCH_TIMEOUT_MS = 8000;

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
