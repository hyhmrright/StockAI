import type { KlineRequest, KlinePoint, RealtimeQuote } from '../../shared/types';
import type { NormalizedRequest } from './types';
import { detectMarket } from '../../shared/market';
import { fetchYahooKline, fetchYahooQuote } from './yahoo';
import { fetchTencentKline, fetchTencentQuote } from './tencent';
import { fetchEastmoneyKline } from './eastmoney';
import { logger, toErrorMessage } from '../utils';

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
 * 拉取 K 线 — A 股先腾讯，失败回退东财；美股 Yahoo
 */
export async function getKline(req: KlineRequest): Promise<KlinePoint[]> {
  const n = normalize(req);
  if (n.market === '美股') return fetchYahooKline(n);

  try {
    return await fetchTencentKline(n);
  } catch (err) {
    logger.warn(`腾讯 K 线失败，回退东财：${toErrorMessage(err)}`);
    return fetchEastmoneyKline(n);
  }
}

/**
 * 拉取实时报价
 */
export async function getQuote(symbol: string): Promise<RealtimeQuote> {
  const market = detectMarket(symbol);
  return market === '美股' ? fetchYahooQuote(symbol) : fetchTencentQuote(symbol);
}
