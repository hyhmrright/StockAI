import type { QuantBundle } from '../../shared/types';
import type { FinancialMetrics } from './types';
import { getKline, getQuote } from '../kline';
import { analyzeTechnical } from './technical';
import { fetchFundamentals, scoreFundamentals } from './fundamental';
import { computeComposite } from './scoring';
import { computeValuation } from './valuation';
import { computeRiskMetrics } from './volatility';
import { fetchFundFlow } from './fundflow';
import { detectMarket } from '../../shared/market';
import { logger, toErrorMessage } from '../utils';

export interface QuantDeps {
  getKline?: typeof getKline;
  getQuote?: typeof getQuote;
  fetchFundamentals?: typeof fetchFundamentals;
  fetchFundFlow?: typeof fetchFundFlow;
}

export async function fetchQuantBundle(symbol: string, deps: QuantDeps = {}): Promise<QuantBundle> {
  const _getKline = deps.getKline ?? getKline;
  const _getQuote = deps.getQuote ?? getQuote;
  const _fetchFundamentals = deps.fetchFundamentals ?? fetchFundamentals;
  const _fetchFundFlow = deps.fetchFundFlow ?? fetchFundFlow;

  const market = detectMarket(symbol);

  const [klineResult, quoteResult, fundamentalsResult, fundFlowResult] = await Promise.allSettled([
    _getKline({ symbol, period: '1d', range: '1y' }),
    _getQuote(symbol),
    _fetchFundamentals(symbol, market),
    // 资金流仅 A 股有数据源，美股直接给 null（不发请求）
    market === 'A股' ? _fetchFundFlow(symbol) : Promise.resolve(null),
  ]);

  const kline = klineResult.status === 'fulfilled' ? klineResult.value : [];
  const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
  const fundFlow = fundFlowResult.status === 'fulfilled' ? fundFlowResult.value : null;

  const fundamentalsRaw: FinancialMetrics = {
    ...(fundamentalsResult.status === 'fulfilled' ? fundamentalsResult.value : {}),
  };

  if (quote) {
    if (quote.pe != null && fundamentalsRaw.pe == null) fundamentalsRaw.pe = quote.pe;
    if (quote.pb != null && fundamentalsRaw.pb == null) fundamentalsRaw.pb = quote.pb;
    if (quote.marketCap != null) fundamentalsRaw.marketCap = quote.marketCap;
  }

  if (klineResult.status === 'rejected') {
    logger.warn(`K 线获取失败: ${toErrorMessage(klineResult.reason)}`);
  }

  const technicalResult = analyzeTechnical(kline);
  const fundamentalResult = scoreFundamentals(fundamentalsRaw);
  const valuationResult = computeValuation(fundamentalsRaw);
  const riskResult = computeRiskMetrics(kline);
  // 复合分四维化：技术+基本面为基准，blend 估值方向，按风险向中性收敛（缺 valuation/risk 自动降级）
  const composite = computeComposite(
    technicalResult.composite,
    fundamentalResult.composite,
    valuationResult,
    riskResult,
  );

  return {
    symbol,
    technical: technicalResult.composite,
    fundamental: fundamentalResult.composite,
    composite,
    fetchedAt: Date.now(),
    valuation: valuationResult ?? undefined,
    risk: riskResult ?? undefined,
    fundFlow: fundFlow ?? undefined,
  };
}
