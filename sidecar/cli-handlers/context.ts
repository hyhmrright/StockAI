import { outputJson, errorEnvelope } from '../protocol';
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

/**
 * **不要把 handler 的 `try/catch/信封` 样板抽成 `withEnvelope(code, fn)`**（已评估，结论是别抽）。
 *
 * 看起来 20 个 handler 都在重复同一组四行，实际只有 8 个是「一个 try、一次成功 out、
 * 一句 catch」的纯形状；另外 12 个各有额外出口——`handleCompany` 非 A 股时用
 * `ERR_COMPANY_NOT_A_SHARE` 提前返回、`handleBacktest` K 线不足时用
 * `ERR_INSUFFICIENT_DATA`、`handleChat` 与 `handleScreen` 各有两个 catch 分类不同错因、
 * `handleListModels` 有五个出口。包装器吃不下这 12 个，于是要么同一文件里并存两种写法
 * （比现在更难读），要么让包装器支持「提前以别的码返回」——那得靠抛特定异常或返回哨兵，
 * 是把复杂度搬家而不是消除。
 *
 * 更要紧的是架构铁律「每个 handler 的所有出口都要写一次且仅一次信封」：出口摆在明面上
 * 才能一眼核对，藏进包装层就只能靠读包装器的实现来推断。
 */

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
