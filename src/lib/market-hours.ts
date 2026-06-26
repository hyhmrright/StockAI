import type { Market } from '../../shared/types';

export type { Market };
export { detectMarket } from '../../shared/market';

/**
 * 涨色：A 股红、美股绿
 */
export function upColor(market: Market): string {
  return market === 'A股' ? '#FF4D4F' : '#10B981';
}

/**
 * 跌色：A 股绿、美股红
 */
export function downColor(market: Market): string {
  return market === 'A股' ? '#10B981' : '#FF4D4F';
}

/**
 * 给定时间戳（ms），判断是否落在该市场的交易时段（含盘前盘后/美股）
 * 不考虑节假日（免费数据源也不提供节假日日历，用户切换股票时会自动重拉）
 */
export function isTradingHours(market: Market, ts: number = Date.now()): boolean {
  if (market === 'A股') {
    // 北京时间 = UTC+8
    const beijing = new Date(ts + 8 * 60 * 60 * 1000);
    const day = beijing.getUTCDay();
    if (day === 0 || day === 6) return false;
    const h = beijing.getUTCHours();
    const m = beijing.getUTCMinutes();
    const mins = h * 60 + m;
    // 9:30-11:30, 13:00-15:00
    return (mins >= 9 * 60 + 30 && mins <= 11 * 60 + 30) || (mins >= 13 * 60 && mins <= 15 * 60);
  } else {
    // 美股按 ET（EDT/EST），夏令时简化：3月第2周日 ~ 11月第1周日 = EDT(UTC-4)，否则 EST(UTC-5)
    const d = new Date(ts);
    const offsetH = isEdt(d) ? -4 : -5;
    const et = new Date(ts + offsetH * 60 * 60 * 1000);
    const day = et.getUTCDay();
    if (day === 0 || day === 6) return false;
    const h = et.getUTCHours();
    // 含盘前 04:00 + 常规 09:30-16:00 + 盘后 16:00-20:00
    return h >= 4 && h < 20;
  }
}

function isEdt(d: Date): boolean {
  // DST 切换发生在周日 02:00 ET；由于周末闭市覆盖了切换前后窗口，
  // 直接用 00:00 UTC 作为边界对 isTradingHours 不会产生可观察差异。
  const year = d.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(Date.UTC(year, 2, 1 + ((7 - march.getUTCDay() + 7) % 7) + 7));
  const nov = new Date(Date.UTC(year, 10, 1));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov.getUTCDay()) % 7)));
  return d >= dstStart && d < dstEnd;
}
