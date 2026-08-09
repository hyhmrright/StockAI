import type {
  KlineRequest,
  KlinePoint,
  KlinePeriod,
  RealtimeQuote,
  BatchQuoteResult,
  Market,
} from '../../shared/types';
import type { NormalizedRequest, KlineSourceDeps } from './types';
import { detectMarket } from '../../shared/market';
import { MAX_BATCH_QUOTES } from '../../shared/constants';
import { fetchYahooKline, fetchYahooQuote } from './yahoo';
import { fetchTencentKline, fetchTencentQuote, fetchTencentUsQuote } from './tencent';
import { fetchEastmoneyKline } from './eastmoney';
import {
  fetchSinaUsKline,
  fetchSinaCnKline,
  fetchSinaUsQuote,
  fetchSinaCnQuote,
  sinaUsSupportsPeriod,
  sinaCnSupportsPeriod,
} from './sina';
import { logger, toErrorMessage, runWithConcurrency } from '../utils';

interface KlineSource {
  name: string;
  fetch: (req: NormalizedRequest, deps: KlineSourceDeps) => Promise<KlinePoint[]>;
  /** 该源支持哪些周期；缺省视为全支持 */
  supportsPeriod?: (period: KlinePeriod) => boolean;
}

interface QuoteSource {
  name: string;
  fetch: (symbol: string, deps: KlineSourceDeps) => Promise<RealtimeQuote>;
}

/**
 * K 线源，按市场的优先级——「哪些源、按什么顺序」的唯一声明。
 * 新增数据源只需在对应市场的数组里加一行，不必改控制流。
 *
 * **美股为什么 Yahoo 打头**：它是唯一提供**复权**历史的源。中文源（新浪/腾讯/东财）
 * 一律返回不复权原始价——AAPL 2020-08-28 收 499.23、08-31 收 129.04，4:1 拆股当天
 * 直接断崖。所以中文源只做兜底：有断层的历史远好过整片空白，但能拿复权的就别用它。
 */
const KLINE_SOURCES: Record<Market, KlineSource[]> = {
  A股: [
    { name: '腾讯', fetch: fetchTencentKline },
    { name: '东财', fetch: fetchEastmoneyKline },
    // 第三源：前两者都给前复权，新浪不复权，故垫底。存在的理由是东财的 push2his
    // 会整个主机级挂掉（2026-08-09 实测连接重置），那时 A 股 K 线就只剩腾讯一根独苗
    { name: '新浪', fetch: fetchSinaCnKline, supportsPeriod: sinaCnSupportsPeriod },
  ],
  美股: [
    { name: 'Yahoo', fetch: fetchYahooKline },
    { name: '新浪', fetch: fetchSinaUsKline, supportsPeriod: sinaUsSupportsPeriod },
  ],
};

/**
 * 报价源，与 K 线**分表且顺序不同**，因为两者的取舍不是一回事：
 *
 * - 报价没有复权概念，只看拿不拿得到，故美股把国内可达的腾讯/新浪排在 Yahoo 前面。
 *   放反了代价很实在——报价每 10 秒轮询一次，Yahoo 不可达时每一轮都要先吃满 8 秒超时。
 * - A 股报价此前只有腾讯一个源（东财没有报价接口），补上新浪消掉这个单点。
 *
 * 分表也顺带去掉了「某源没有某能力」的可选字段：不提供报价的源不出现在这张表里即可。
 */
const QUOTE_SOURCES: Record<Market, QuoteSource[]> = {
  A股: [
    { name: '腾讯', fetch: fetchTencentQuote },
    { name: '新浪', fetch: fetchSinaCnQuote },
  ],
  美股: [
    { name: '腾讯', fetch: fetchTencentUsQuote },
    { name: '新浪', fetch: fetchSinaUsQuote },
    { name: 'Yahoo', fetch: fetchYahooQuote },
  ],
};

function normalize(req: KlineRequest): NormalizedRequest {
  return {
    rawSymbol: req.symbol,
    period: req.period,
    range: req.range,
    adjust: req.adjust ?? 'qfq',
    market: detectMarket(req.symbol),
  };
}

/**
 * 依次尝试各数据源，首个成功即返回；全部失败则抛最后一个错误（保留原始失败原因）。
 * run 返回 undefined 表示该源应对本次请求让位（如新浪没有分钟线），直接跳过。
 */
async function withFallback<S extends { name: string }, T>(
  sources: S[],
  label: string,
  run: (source: S) => Promise<T> | undefined,
): Promise<T> {
  let lastError: unknown = new Error(`${label}：无可用数据源`);
  for (const source of sources) {
    const attempt = run(source);
    if (!attempt) continue;
    try {
      return await attempt;
    } catch (err) {
      lastError = err;
      logger.warn(`${source.name} ${label}拉取失败，尝试下一数据源：${toErrorMessage(err)}`);
    }
  }
  throw lastError;
}

/** 拉取 K 线 — 按 KLINE_SOURCES 的市场优先级顺序回退，跳过不支持该周期的源 */
export async function getKline(
  req: KlineRequest,
  deps: KlineSourceDeps = {},
): Promise<KlinePoint[]> {
  const n = normalize(req);
  return withFallback(KLINE_SOURCES[n.market], 'K 线', (s) =>
    s.supportsPeriod?.(n.period) === false ? undefined : s.fetch(n, deps),
  );
}

/** 拉取实时报价 — 按 QUOTE_SOURCES 的市场优先级顺序回退 */
export async function getQuote(symbol: string, deps: KlineSourceDeps = {}): Promise<RealtimeQuote> {
  const market = detectMarket(symbol);
  return withFallback(QUOTE_SOURCES[market], '报价', (s) => s.fetch(symbol, deps));
}

/** 批量报价对上游的并发上限：既压住 spawn 一次要打的连接数，也避免被数据源限流 */
const QUOTE_CONCURRENCY = 6;

/**
 * 批量拉取实时报价。
 *
 * 存在的理由是进程模型：sidecar 是 spawn-per-call，逐只调 `--quote` 会让一个 10 只的
 * 关注列表每轮起 10 个进程。这里一次进程内并发拉完。
 *
 * 单只失败只进 `failed`，不影响其余——但整批**全军覆没时抛出**，那是数据源挂了，
 * 不该伪装成「查无此股」静静返回空表。
 */
export async function getQuotes(
  symbols: string[],
  deps: KlineSourceDeps = {},
): Promise<BatchQuoteResult> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length > MAX_BATCH_QUOTES) {
    throw new Error(`批量报价一次最多 ${MAX_BATCH_QUOTES} 只，收到 ${unique.length} 只`);
  }

  const quotes: Record<string, RealtimeQuote> = {};
  const failed: string[] = [];
  let lastError: unknown;

  await runWithConcurrency(
    unique.map((symbol) => async () => {
      try {
        quotes[symbol] = await getQuote(symbol, deps);
      } catch (err) {
        lastError = err;
        failed.push(symbol);
        logger.warn(`批量报价跳过 ${symbol}：${toErrorMessage(err)}`);
      }
    }),
    QUOTE_CONCURRENCY,
  );

  if (unique.length > 0 && failed.length === unique.length) throw lastError;
  return { quotes, failed };
}
