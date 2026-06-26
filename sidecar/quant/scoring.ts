import type {
  AnalystSignal,
  ValuationSnapshot,
  RiskSnapshot,
  CompositeBreakdown,
} from '../../shared/types';

const WEIGHTS = { technical: 0.55, fundamental: 0.45 };
// 估值维以 blend 叠加到「技术+基本面」基准分上：缺估值时复合分 == 原 2 维基准，对筛选排序零扰动。
const VALUATION_BLEND = 0.25;
// 估值方向对分数的偏移幅度（按估值置信度缩放）：低估上偏、高估下偏。
const VALUATION_OFFSET = 15;
// 高波动风险把复合分向中性 50 收敛的系数（<1 即压缩，体现「不确定性高→少走极端」）。
const HIGH_RISK_PULL = 0.85;
// 信号→基准分映射；NEUTRAL 同时作为收敛/夹紧的中性锚点。
const SIGNAL_SCORE = { bullish: 70, neutral: 50, bearish: 30 } as const;
// 置信度对基准分的最大上下偏移（confidence 50→0 偏移，0/100→±此值）。
const CONFIDENCE_SWING = 20;
// 复合分→信号的判定边界：>= bullish 看涨，<= bearish 看跌，之间中性。
const SIGNAL_BOUNDARY = { bullish: 60, bearish: 40 } as const;

function signalToScore(s: AnalystSignal): number {
  const base = SIGNAL_SCORE[s.signal] ?? SIGNAL_SCORE.neutral;
  const offset = ((s.confidence - 50) / 50) * CONFIDENCE_SWING;
  return base + (s.signal === 'bearish' ? -offset : offset);
}

/** 估值快照→方向映射分：50 中性，低估上偏、高估下偏，幅度按估值置信度缩放 */
function valuationToScore(v: ValuationSnapshot): number {
  const dir = v.signal === 'undervalued' ? 1 : v.signal === 'overvalued' ? -1 : 0;
  return 50 + (v.confidence / 100) * VALUATION_OFFSET * dir;
}

/**
 * 四维复合分：技术 + 基本面（基准）→ blend 估值方向 → 风险向中性收敛。
 * valuation / risk 缺失时自动降级：均缺则等价于原「技术 0.55 + 基本面 0.45」两维口径。
 */
export function computeComposite(
  technical: AnalystSignal,
  fundamental: AnalystSignal,
  valuation?: ValuationSnapshot | null,
  risk?: RiskSnapshot | null,
): { signal: 'bullish' | 'bearish' | 'neutral'; score: number; breakdown?: CompositeBreakdown } {
  const techScore = signalToScore(technical);
  const fundScore = signalToScore(fundamental);
  const base = techScore * WEIGHTS.technical + fundScore * WEIGHTS.fundamental;

  // 估值 blend：无估值时 blended === base（零排序扰动）
  let valScore: number | undefined;
  let blended = base;
  if (valuation) {
    valScore = valuationToScore(valuation);
    blended = base * (1 - VALUATION_BLEND) + valScore * VALUATION_BLEND;
  }

  // 风险调制：高波动把分数向中性 50 收敛
  let riskPull: number | undefined;
  if (risk) {
    riskPull = risk.riskLevel === 'high' ? HIGH_RISK_PULL : 1;
    blended = 50 + (blended - 50) * riskPull;
  }

  const score = Math.round(Math.max(1, Math.min(100, blended)));
  const signal =
    score >= SIGNAL_BOUNDARY.bullish
      ? 'bullish'
      : score <= SIGNAL_BOUNDARY.bearish
        ? 'bearish'
        : 'neutral';

  const breakdown: CompositeBreakdown | undefined =
    valuation || risk
      ? {
          technical: Math.round(techScore),
          fundamental: Math.round(fundScore),
          valuation: valScore != null ? Math.round(valScore) : undefined,
          riskPull,
        }
      : undefined;

  return { signal, score, breakdown };
}
