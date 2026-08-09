import type { FundFlowData } from '../../shared/types';
import { parseChinaSymbol, chinaPrefixToEastmoneyMarket } from '../kline/symbol';
import { fetchWithPolicy } from '../http';
import { logger, toErrorMessage } from '../utils';
import { extractSinaJson } from '../parsers/sina-envelope';

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

export interface FundFlowDeps {
  fetchImpl?: typeof fetch;
}

/** 东财：带日期的日线资金流，字段最全，为首选 */
export async function fetchEastmoneyFundFlow(
  symbol: string,
  deps: FundFlowDeps = {},
): Promise<FundFlowData | null> {
  const { prefix, code } = parseChinaSymbol(symbol);
  const market = chinaPrefixToEastmoneyMarket(prefix);
  const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=1&klt=101&secid=${market}.${code}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65`;
  // 默认超时：资金流走 Promise.allSettled，挂起会拖累整个 A 股 quant bundle
  const resp = await fetchWithPolicy(url, {
    headers: { Referer: 'https://data.eastmoney.com' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`东财资金流 HTTP ${resp.status}`);
  return parseFundFlow(await resp.json());
}

/**
 * 新浪备源：东财 push2his 整机挂掉时（2026-08-09 实测连接重置）的兜底。
 *
 * 与东财的两点差异，都不做掩饰：
 * - **没有日期字段**，返回的是实时快照，故 `date` 留空由 UI 隐去。
 * - 主力净额与占比东财直接给，这里得自己算：主力 = 超大单 + 大单，
 *   占比的分母用四档成交额之和（实测与 volume × price 一致）。
 */
export async function fetchSinaFundFlow(
  symbol: string,
  deps: FundFlowDeps = {},
): Promise<FundFlowData | null> {
  const { prefix, code } = parseChinaSymbol(symbol);
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssi_ssfx_flzjtj?daima=${prefix}${code}`;
  const resp = await fetchWithPolicy(url, {
    headers: { Referer: 'https://finance.sina.com.cn' },
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`新浪资金流 HTTP ${resp.status}`);
  // 含中文股票名，GBK
  return parseSinaFundFlow(new TextDecoder('gbk').decode(await resp.arrayBuffer()));
}

/**
 * 新浪资金流响应：`{r0_in,r0_out,r0, r1_*, r2_*, r3_*, ...}`（GBK，外面可能裹 JSONP）。
 * r0=超大单 r1=大单 r2=中单 r3=小单；`_in`/`_out` 为流入/流出额，裸键为该档成交额。
 */
export function parseSinaFundFlow(raw: string): FundFlowData | null {
  const d = extractSinaJson<Record<string, string>>(raw, '{');
  if (!d) return null;

  const n = (k: string) => {
    const v = Number(d[k]);
    return Number.isFinite(v) ? v : 0;
  };
  // 四档都缺 → 不是这个接口的响应，别产出一份全 0 的"资金流"
  if (['r0_in', 'r1_in', 'r2_in', 'r3_in'].every((k) => d[k] === undefined)) return null;

  const net = (tier: string) => n(`${tier}_in`) - n(`${tier}_out`);
  const superLargeNet = net('r0');
  const largeNet = net('r1');
  const mainNet = superLargeNet + largeNet;
  const turnoverAmount = n('r0') + n('r1') + n('r2') + n('r3');

  return {
    // date 刻意不填：本源是实时快照、没有日期，拿"今天"顶上会在周末标错
    mainNet,
    superLargeNet,
    largeNet,
    mediumNet: net('r2'),
    smallNet: net('r3'),
    mainNetPct: turnoverAmount ? Number(((mainNet / turnoverAmount) * 100).toFixed(2)) : 0,
  };
}

/** 抓取个股资金流（仅 A 股；非 A 股或全部源失败返回 null，不阻断量化主流程） */
export async function fetchFundFlow(
  symbol: string,
  deps: FundFlowDeps = {},
): Promise<FundFlowData | null> {
  try {
    return await fetchEastmoneyFundFlow(symbol, deps);
  } catch (err) {
    logger.warn(`东财资金流失败，回退新浪 (${symbol}): ${toErrorMessage(err)}`);
  }
  try {
    return await fetchSinaFundFlow(symbol, deps);
  } catch (err) {
    logger.warn(`资金流抓取失败 (${symbol}): ${toErrorMessage(err)}`);
    return null;
  }
}
