import { outputJson, errorEnvelope } from '../utils';
import type {
  performFullAnalysis as AnalysisFn,
  fetchMarketBundle as FetchBundleFn,
  analyzeNewsWithLLM as AnalyzeFn,
} from '../analysis';
import type { fetchFinancialHistory as FinancialHistoryFn } from '../quant/fundamental-history';
import type { fetchMarketSnapshot as MarketSnapshotFn } from '../quant/market-snapshot';
import type {
  retrieveReportChunks as RetrieveReportChunksFn,
  ensureReportIndex as EnsureReportIndexFn,
} from '../rag';
import type { runChat as RunChatFn } from '../chat';
import type { fetchProviderModels } from './models';

/**
 * 全部 handler 的测试注入点。默认走真实实现，测试按需替换以保持离线可跑。
 * 各 handler 一律 `deps._x ?? await import(...)`——重依赖必须留在函数体内懒加载。
 */
export interface HandlerDeps {
  _out?: typeof outputJson;
  _analyze?: typeof AnalysisFn;
  _fetchBundle?: typeof FetchBundleFn;
  _analyzeOnly?: typeof AnalyzeFn;
  /** 测试注入：替换真实的列模型 HTTP 拉取，避开网络 */
  _listModelsFetch?: typeof fetchProviderModels;
  /** 测试注入：替换历史财务/全市场快照的真实抓取，避开网络 */
  _fetchFinancialHistory?: typeof FinancialHistoryFn;
  _fetchMarketSnapshot?: typeof MarketSnapshotFn;
  /** 测试注入：替换财报 RAG 检索，避开网络（保持 handleChat 离线可测） */
  _retrieveReportChunks?: typeof RetrieveReportChunksFn;
  /** 测试注入：替换财报索引预热，避开网络（保持 handleIndexReports 离线可测） */
  _ensureReportIndex?: typeof EnsureReportIndexFn;
  /** 测试注入：替换对话补全，避开真实 LLM 调用（保持 handleChat 离线可测） */
  _runChat?: typeof RunChatFn;
}

/** 各领域 handler 模块共享的上下文：输出通道 + 注入点 + 通用守卫 */
export interface HandlerContext {
  out: typeof outputJson;
  deps: HandlerDeps;
  /**
   * symbol 缺参守卫：缺失时写 ERR_MISSING_PARAM 信封并返回 false，调用方据此提前 return。
   * 收敛为一处，避免同一判断散落各 handler 且文案分裂成两套说法。
   */
  requireSymbol(symbol: string | undefined): boolean;
}

export function createContext(deps: HandlerDeps): HandlerContext {
  const out = deps._out ?? outputJson;
  return {
    out,
    deps,
    requireSymbol(symbol) {
      if (symbol) return true;
      out(errorEnvelope('ERR_MISSING_PARAM', '未提供股票代码'));
      return false;
    },
  };
}
