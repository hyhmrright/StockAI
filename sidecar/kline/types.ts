import type {
  KlinePoint,
  RealtimeQuote,
  KlinePeriod,
  KlineRange,
  AdjustMode,
  Market,
} from '../../shared/types';

export type { KlinePoint, RealtimeQuote, KlinePeriod, KlineRange, AdjustMode, Market };

/**
 * 各数据源共用的注入点：替换真实网络，让「A 源失败→回退 B 源」这条容错逻辑可离线测试。
 * 超时/UA 不在此定义——统一由 sidecar/http.ts 的 fetchWithPolicy 应用 HTTP_DEFAULTS。
 */
export interface KlineSourceDeps {
  fetchImpl?: typeof fetch;
}

/**
 * Sidecar 内部规范化的参数：路由层把用户原始 symbol 转成各源能识别的形式
 */
export interface NormalizedRequest {
  rawSymbol: string;
  period: KlinePeriod;
  range: KlineRange;
  adjust: AdjustMode;
  market: Market;
}
