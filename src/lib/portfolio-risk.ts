import type { KlinePoint } from '../../shared/types';
export function concentration(values: { symbol: string; value: number }[]) {
  const total = values.reduce((s, p) => s + p.value, 0);
  const weights = values
    .map((p) => ({ ...p, weight: total > 0 ? p.value / total : 0 }))
    .sort((a, b) => b.weight - a.weight);
  return {
    total,
    weights,
    hhi: weights.reduce((s, p) => s + p.weight * p.weight, 0),
    largest: weights[0]?.weight ?? 0,
  };
}
/** 仅比较共有交易日的收益，不把停牌缺值当零波动。 */
export function priceCorrelation(a: KlinePoint[], b: KlinePoint[]): number | null {
  const returns = (bars: KlinePoint[]) =>
    new Map(
      bars
        .slice(1)
        .flatMap((bar, i) =>
          bars[i].close > 0 ? [[bar.time, bar.close / bars[i].close - 1] as const] : [],
        ),
    );
  const ar = returns(a),
    br = returns(b);
  const pairs = [...ar].filter(([time]) => br.has(time)).map(([time, v]) => [v, br.get(time)!]);
  if (pairs.length < 20) return null;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / pairs.length,
    mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  const covariance = pairs.reduce((s, p) => s + (p[0] - ma) * (p[1] - mb), 0);
  const varianceA = pairs.reduce((s, p) => s + (p[0] - ma) ** 2, 0),
    varianceB = pairs.reduce((s, p) => s + (p[1] - mb) ** 2, 0);
  return varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : null;
}
