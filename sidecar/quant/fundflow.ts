import type { FundFlowData } from '../../shared/types';
import { parseChinaSymbol, chinaPrefixToEastmoneyMarket } from '../kline/symbol';
import { logger, toErrorMessage } from '../utils';

/** 东财资金流接口响应结构 */
interface FundFlowResponse {
  data?: { klines?: string[] };
}

/**
 * 解析东财 fflow/daykline 响应，取最新一日资金流。
 * 每行字段顺序（逗号分隔）：日期, 主力净流入, 超大单, 大单, 中单, 小单, 主力占比%, ...（后续为各单占比/收盘价/涨跌幅）。
 */
export function parseFundFlow(json: FundFlowResponse): FundFlowData | null {
  const klines = json?.data?.klines;
  if (!Array.isArray(klines) || klines.length === 0) return null;
  const f = klines[klines.length - 1].split(','); // 最新一日
  if (f.length < 7) return null;
  const num = (i: number) => {
    const n = parseFloat(f[i]);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    date: f[0],
    mainNet: num(1),
    superLargeNet: num(2),
    largeNet: num(3),
    mediumNet: num(4),
    smallNet: num(5),
    mainNetPct: num(6),
  };
}

/** 抓取个股资金流（仅 A 股；非 A 股或失败返回 null，不阻断量化主流程） */
export async function fetchFundFlow(symbol: string): Promise<FundFlowData | null> {
  try {
    const { prefix, code } = parseChinaSymbol(symbol);
    const market = chinaPrefixToEastmoneyMarket(prefix);
    const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=1&klt=101&secid=${market}.${code}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
    const resp = await fetch(url, { headers: { Referer: 'https://data.eastmoney.com' } });
    if (!resp.ok) throw new Error(`东财资金流 HTTP ${resp.status}`);
    return parseFundFlow(await resp.json());
  } catch (err) {
    logger.warn(`资金流抓取失败 (${symbol}): ${toErrorMessage(err)}`);
    return null;
  }
}
