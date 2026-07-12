import type { MasterWeightInput } from '../../shared/types';

/**
 * 大师动态权重：把历史命中率转成聚合层话语权系数。
 * 三重防线关掉 false precision——硬最小样本阈值 + 贝叶斯收缩 + 权重钳位。
 * 纯函数，无 IO，离线可测。
 */

/** 硬阈值：已裁决样本 < 5 → 不入 Map → 消费方按默认权重 1.0，完全不做动态调整 */
export const MIN_SAMPLE = 5;
/** 贝叶斯先验：无信息基准命中率（对称 Beta 先验中心） */
export const PRIOR_HIT_RATE = 0.5;
/** 伪计数 α：收缩强度（≈ 注入 10 条「平均水平」虚拟信号，小样本被强力拉回 0.5） */
export const SHRINK_STRENGTH = 10;
/** K：收缩后命中率每偏离 0.5 一个单位，权重偏离 1.0 的斜率 */
export const SENSITIVITY = 1.0;
/** 权重下限（避免完全静音某大师） */
export const WEIGHT_MIN = 0.5;
/** 权重上限（避免单一大师主导） */
export const WEIGHT_MAX = 1.5;

/** sidecar 内部计算结果：达阈值大师的权重及其可解释元数据（供 prompt 标注） */
export interface MasterWeight {
  weight: number;
  hitRate: number;
  sampleSize: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 由命中率摘要算各大师权重。
 * 返回的 Map **只含达阈值的大师**；不在 Map 中 == 无可信战绩 == 消费端默认权重 1.0、不做 prompt 标注。
 */
export function computeMasterWeights(summary: MasterWeightInput[]): Map<string, MasterWeight> {
  const out = new Map<string, MasterWeight>();
  for (const { masterId, sampleSize, hits } of summary) {
    // 防线 1（硬阈值）：样本不足直接跳过，退化为默认权重
    if (sampleSize < MIN_SAMPLE) continue;
    // 防线 2（贝叶斯收缩）：小样本被强力拉回 0.5，样本越大越接近真实 hits/n
    const shrunk = (hits + SHRINK_STRENGTH * PRIOR_HIT_RATE) / (sampleSize + SHRINK_STRENGTH);
    // 防线 3（钳位）：兜底极端值，任何大师都不被完全静音或独裁
    const weight = clamp(1 + SENSITIVITY * (shrunk - PRIOR_HIT_RATE), WEIGHT_MIN, WEIGHT_MAX);
    out.set(masterId, { weight, hitRate: hits / sampleSize, sampleSize });
  }
  return out;
}
