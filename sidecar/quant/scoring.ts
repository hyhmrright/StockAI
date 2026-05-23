import type { AnalystSignal } from '../../shared/types';

const WEIGHTS = { technical: 0.55, fundamental: 0.45 };

function signalToScore(s: AnalystSignal): number {
  let base: number;
  switch (s.signal) {
    case 'bullish': base = 70; break;
    case 'bearish': base = 30; break;
    default: base = 50;
  }
  const offset = ((s.confidence - 50) / 50) * 20;
  return base + (s.signal === 'bearish' ? -offset : offset);
}

export function computeComposite(
  technical: AnalystSignal,
  fundamental: AnalystSignal,
): { signal: 'bullish' | 'bearish' | 'neutral'; score: number } {
  const techScore = signalToScore(technical);
  const fundScore = signalToScore(fundamental);
  const raw = techScore * WEIGHTS.technical + fundScore * WEIGHTS.fundamental;
  const score = Math.round(Math.max(1, Math.min(100, raw)));
  const signal = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  return { signal, score };
}
