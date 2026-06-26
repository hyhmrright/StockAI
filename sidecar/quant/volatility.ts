import type { KlinePoint, RiskSnapshot } from '../../shared/types';
import { TRADING_DAYS_PER_YEAR, RISK_FREE_RATE } from '../../shared/constants';

const MIN_DAYS = 30;

export function computeRiskMetrics(kline: KlinePoint[]): RiskSnapshot | null {
  if (kline.length < MIN_DAYS) return null;

  const sorted = [...kline].sort((a, b) => a.time - b.time);
  const closes = sorted.map((k) => k.close);

  // 计算每日收益率
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (returns.length < MIN_DAYS - 1) return null;

  // 年化波动率
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const annualizedVolatility = dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR);

  // 波动率百分位（滚动 20 日窗口）
  const windowSize = 20;
  const rollingVols: number[] = [];
  for (let i = windowSize; i <= returns.length; i++) {
    const window = returns.slice(i - windowSize, i);
    const wMean = window.reduce((s, r) => s + r, 0) / windowSize;
    const wVar = window.reduce((s, r) => s + (r - wMean) ** 2, 0) / windowSize;
    rollingVols.push(Math.sqrt(wVar) * Math.sqrt(TRADING_DAYS_PER_YEAR));
  }
  const currentVol =
    rollingVols.length > 0 ? rollingVols[rollingVols.length - 1] : annualizedVolatility;
  let belowCount = 0;
  for (const v of rollingVols) {
    if (v < currentVol) belowCount++;
  }
  const volatilityPercentile =
    rollingVols.length > 0 ? Math.round((belowCount / rollingVols.length) * 100) : 50;

  // 最大回撤
  let peak = closes[0];
  let maxDrawdown = 0;
  for (const price of closes) {
    if (price > peak) peak = price;
    const drawdown = (price - peak) / peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  // 夏普比率代理（年化收益 - 无风险利率）/ 年化波动率
  const annualizedReturn = mean * TRADING_DAYS_PER_YEAR;
  const sharpeProxy =
    annualizedVolatility > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualizedVolatility : 0;

  // 风险等级划分
  let riskLevel: 'low' | 'medium' | 'high';
  if (annualizedVolatility < 0.2) riskLevel = 'low';
  else if (annualizedVolatility < 0.4) riskLevel = 'medium';
  else riskLevel = 'high';

  return {
    annualizedVolatility: Math.round(annualizedVolatility * 1000) / 1000,
    volatilityPercentile,
    maxDrawdown: Math.round(maxDrawdown * 1000) / 1000,
    sharpeProxy: Math.round(sharpeProxy * 100) / 100,
    riskLevel,
  };
}
