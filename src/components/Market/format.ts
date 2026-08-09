/**
 * 资金金额收敛为亿/万。原始单位是元，直接显示是一串十位数字，
 * 榜单里几十行摞在一起完全读不出量级差异。
 */
export function formatAmount(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(0)} 万`;
  return String(Math.round(v));
}
