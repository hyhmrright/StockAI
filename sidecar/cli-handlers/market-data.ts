import { successEnvelope, errorEnvelope, errorEnvelopeFromUnknown } from '../utils';
import type { HandlerContext } from './context';

/**
 * 纯行情/量化数据的 handler——全部不调 LLM，因此不需要 ResolvedConfig。
 * 重依赖（kline / quant / backtest / stock-info）一律留在函数体内 await import，
 * 避免把 playwright 一系拖进启动路径。
 */
export function createMarketDataHandlers({ out, deps, requireSymbol }: HandlerContext) {
  return {
    /**
     * 获取股票信息
     */
    async handleInfo(symbol: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const { parseSymbol } = await import('../parsers/exchange');
        const { fetchStockInfo } = await import('../stock-info');
        const parsed = parseSymbol(symbol);
        const info = await fetchStockInfo(parsed);
        if (info) {
          out(successEnvelope(info));
        } else {
          out(errorEnvelope('ERR_NOT_FOUND', `未找到股票 "${symbol}" 的信息`));
        }
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_INFO', error));
      }
    },

    /**
     * 搜索股票
     */
    async handleSearch(keyword: string) {
      if (!keyword) {
        out(successEnvelope([]));
        return;
      }
      try {
        const { searchStocks } = await import('../search');
        const results = await searchStocks(keyword);
        out(successEnvelope(results));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_SEARCH', error));
      }
    },

    /**
     * 拉取 K 线
     */
    async handleKline(reqJson: string) {
      try {
        const req = JSON.parse(reqJson);
        if (!requireSymbol(req?.symbol)) return;
        const { getKline } = await import('../kline');
        const points = await getKline(req);
        out(successEnvelope(points));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_KLINE', error));
      }
    },

    /**
     * 拉取实时报价
     */
    async handleQuote(symbol: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const { getQuote } = await import('../kline');
        const quote = await getQuote(symbol);
        out(successEnvelope(quote));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUOTE', error));
      }
    },

    /**
     * 批量拉取实时报价（逗号分隔的代码表）。
     *
     * 单只失败进 `failed` 不影响其余；全批失败或超出规模上限才报错——前者是数据源挂了，
     * 后者是调用方传错，两种都不该静静返回空表。
     */
    async handleQuotes(symbolsCsv: string) {
      const symbols = (symbolsCsv ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (symbols.length === 0) {
        out(errorEnvelope('ERR_MISSING_PARAM', '批量报价缺少股票代码'));
        return;
      }
      try {
        const { getQuotes } = await import('../kline');
        out(successEnvelope(await getQuotes(symbols)));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUOTE', error));
      }
    },

    async handleQuant(symbol: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const { fetchQuantBundle } = await import('../quant');
        const bundle = await fetchQuantBundle(symbol);
        out(successEnvelope(bundle));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_QUANT', error));
      }
    },

    /**
     * 历史财务时序（按需拉东财 F10，24h 磁盘缓存）— 供 #11 RAG 数值溯源 / #12 因子预计算。
     * periods 为字符串（CLI 传入），非法/缺省时默认 12 期。
     */
    async handleFinancialHistory(symbol: string, periods?: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const parsed = periods ? Number.parseInt(periods, 10) : Number.NaN;
        const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
        const fetchHistory =
          deps._fetchFinancialHistory ??
          (await import('../quant/fundamental-history')).fetchFinancialHistory;
        const history = await fetchHistory(symbol, n);
        out(successEnvelope(history));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_FIN_HISTORY', error));
      }
    },

    /**
     * 全市场基本面快照（分页串行拉东财 clist，24h 磁盘缓存）— 供 #14 NL 选股粗筛。
     * 返回全市场横截面；深层财报字段由候选精拉补齐（两阶段筛选）。
     */
    async handleMarketSnapshot() {
      try {
        const fetchSnapshot =
          deps._fetchMarketSnapshot ??
          (await import('../quant/market-snapshot')).fetchMarketSnapshot;
        const snapshot = await fetchSnapshot();
        out(successEnvelope(snapshot));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_MARKET_SNAPSHOT', error));
      }
    },

    async handleBacktest(symbol: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const { getKline } = await import('../kline');
        const kline = await getKline({ symbol, period: '1d', range: '1y' });
        const { runBacktest, MIN_BACKTEST_BARS } = await import('../backtest/engine');
        if (kline.length < MIN_BACKTEST_BARS) {
          out(
            errorEnvelope(
              'ERR_INSUFFICIENT_DATA',
              `K 线数据不足（${kline.length} 天），需要至少 ${MIN_BACKTEST_BARS} 天`,
            ),
          );
          return;
        }
        const { DEFAULT_BACKTEST_PARAMS } = await import('../backtest/types');
        const result = runBacktest(kline, {
          ...DEFAULT_BACKTEST_PARAMS,
          symbol,
          period: kline.length,
        });
        out(successEnvelope(result));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_BACKTEST', error));
      }
    },
  };
}
