import type { KlinePoint, KlinePeriod, AdjustMode, NormalizedRequest } from "./types";

export function mapPeriodToEastmoney(p: KlinePeriod): number {
  return ({ "1m": 1, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1d": 101, "1w": 102, "1mo": 103 } as const)[p];
}

export function mapAdjustToEastmoney(a: AdjustMode): number {
  return a === "qfq" ? 1 : a === "hfq" ? 2 : 0;
}

/** 把腾讯式前缀 (sh/sz/bj) 映射为东财 secid 市场码 */
function getMarketCode(rawSymbol: string): number {
  const m = rawSymbol.match(/^(sh|sz|bj)?(\d{6})/i);
  if (!m) throw new Error(`无法解析 A 股代码：${rawSymbol}`);
  const prefix = (m[1] || "").toLowerCase();
  const code = m[2];
  if (prefix === "sh" || code.startsWith("6")) return 1;
  if (prefix === "bj" || code.startsWith("4") || code.startsWith("8")) return 0;
  return 0; // sz/创业板
}

function extractCode(rawSymbol: string): string {
  const m = rawSymbol.match(/\d{6}/);
  if (!m) throw new Error(`无法在 ${rawSymbol} 中找到 6 位代码`);
  return m[0];
}

export async function fetchEastmoneyKline(req: NormalizedRequest): Promise<KlinePoint[]> {
  const code = extractCode(req.rawSymbol);
  const market = getMarketCode(req.rawSymbol);
  const klt = mapPeriodToEastmoney(req.period);
  const fqt = mapAdjustToEastmoney(req.adjust);

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market}.${code}&klt=${klt}&fqt=${fqt}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&end=20500101&lmt=1000`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`东财 K 线 HTTP ${resp.status}`);
  const json = await resp.json();
  return parseEastmoneyKline(json);
}

export function parseEastmoneyKline(json: any): KlinePoint[] {
  const klines: string[] = json?.data?.klines || [];
  return klines.map((row) => {
    // 字段顺序：日期, 开, 收, 高, 低, 成交量(手), 成交额, 振幅, 涨跌幅, 涨跌额, 换手率
    const f = row.split(",");
    const time = Math.floor(new Date(
      f[0].length === 10 ? f[0] + "T00:00:00+08:00" : f[0].replace(" ", "T") + "+08:00"
    ).getTime() / 1000);
    return {
      time,
      open: parseFloat(f[1]),
      close: parseFloat(f[2]),
      high: parseFloat(f[3]),
      low: parseFloat(f[4]),
      volume: parseFloat(f[5]) * 100, // 东财单位为手，转换为股
      amount: parseFloat(f[6]),
    };
  });
}
