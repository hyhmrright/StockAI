import type { TFunction } from '../hooks/useLanguage';
import type { TranslationKey } from '../i18n';

/**
 * 携带服务端错误码的错误，便于 UI 按 code 做差异化提示。
 *
 * 定义在这里而不是 ipc.ts：`instanceof` 依赖类的身份，而 ipc.ts 是个会被组件测试整体
 * mock 掉的重模块（它拉 @tauri-apps/api）。挂在那里会让任何 mock 了 ipc 的测试在
 * 走错误分支时炸在 `instanceof undefined` 上。ipc.ts 再导出它，调用方无需改 import。
 */
export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

/**
 * Sidecar 错误码 → 前端 i18n key 的**唯一**映射表。
 *
 * 为什么必须有它：Sidecar 不知道 UI 语言，`errorEnvelope` 的 message 一律是中文（或上游
 * 库抛出的英文原文）。前端此前在七八处各自 `err.message` 直接上屏，等于 en / ja 用户看到
 * 一串中文技术文案。翻译只能在前端做，也就只能在这里做一次。
 *
 * **只登记能经 IPC 到达 UI 的码**：`ipc: false` 的 CLI 调试 action（`--info` /
 * `--market-snapshot` / `--fundamentals-history`）没有前端调用方，`ERR_SEARCH` 被
 * SearchHeader 吞进 console，登记它们都是死配置。
 *
 * 译文带 `{message}` 的会把原始诊断接在本地化前缀之后；不带的表示 message 无增量信息
 * （如 ERR_SCRAPE_EMPTY 的 message 只是重复"没抓到新闻"）。判据是**用户拿这段 message
 * 能不能改变下一步动作**：provider 返回的 401 / insufficient_quota 能，"所有数据源均失败"
 * 不能。
 */
const SERVICE_ERROR_KEYS: Record<string, TranslationKey> = {
  // 传输层：Sidecar 没起来 / 输出被污染，任何 action 都可能撞上（见 ipc.ts）
  ERR_NO_RESPONSE: 'err_no_response',
  ERR_BAD_RESPONSE: 'err_bad_response',
  ERR_EMPTY_DATA: 'err_empty_data',
  // Rust 层（src-tauri/src/lib.rs）：配置读不到 / 进程起不来 / 临时文件写不了。
  // 这几条的 message 是给开发者的中立诊断，不进用户文案，故译文都不带 {message}。
  ERR_NO_SETTINGS: 'err_no_settings',
  ERR_STORE: 'err_store',
  ERR_SIDECAR_SPAWN: 'err_sidecar_spawn',
  ERR_TEMP_FILE: 'err_temp_file',
  // Sidecar 起来了但没吐 JSON：退出码与 stderr 是唯一线索，必须透出
  ERR_SIDECAR: 'err_sidecar',
  // 任何 action 都可能抛：配置解析与进程级故障
  ERR_CONFIG: 'err_config',
  ERR_BOOT_CRASH: 'err_internal',
  ERR_BOOT_ASYNC: 'err_internal',
  ERR_FATAL: 'err_internal',
  ERR_SERIALIZE: 'err_internal',
  ERR_UNKNOWN: 'err_internal',
  // 参数守卫：正常使用不该出现，出现即三层布线有 bug，所以带上 message 便于定位
  ERR_MISSING_PARAM: 'err_missing_param',
  ERR_INVALID_PARAM: 'err_invalid_param',
  // 行情与量化：失败原因几乎总是"数据源全挂"，用户能做的只有重试，故复用无 message 的既有文案
  ERR_KLINE: 'kline_load_error',
  ERR_QUANT: 'quant_error',
  ERR_QUOTE: 'err_quote',
  // AI 分析链路：message 常是 provider 的 401 / 配额 / 模型名错误，必须透出
  ERR_SCRAPE_EMPTY: 'err_scrape_empty',
  ERR_ANALYSIS_FAILED: 'err_analysis_failed',
  ERR_BUNDLE_FAILED: 'err_analysis_failed',
  ERR_DEEP_ANALYSIS: 'err_analysis_failed',
  ERR_CHAT: 'err_chat',
  ERR_INDEX_REPORTS: 'err_index_reports',
  // 回测
  ERR_BACKTEST: 'err_backtest',
  ERR_INSUFFICIENT_DATA: 'err_insufficient_data',
  // 选股（原先散在 useNlScreener 的局部表）
  ERR_SCREEN: 'screener_err_generic',
  ERR_SCREEN_PARSE: 'screener_err_parse',
  ERR_SCREEN_NO_CONDITIONS: 'screener_err_no_conditions',
  // 列模型（原先散在 ModelSelect 的 switch）
  ERR_LIST_MODELS: 'err_list_models_generic',
  ERR_LIST_MODELS_TIMEOUT: 'err_list_models_timeout',
  ERR_LIST_MODELS_AUTH: 'err_list_models_auth',
  ERR_LIST_MODELS_NETWORK: 'err_list_models_network',
  ERR_LIST_MODELS_SERVER: 'err_list_models_server',
  ERR_LIST_MODELS_BAD_REQUEST: 'err_list_models_bad_request',
};

/** 取错误码对应的 i18n key；非 ServiceError 或未登记的码返回 null。 */
export function serviceErrorKey(err: unknown): TranslationKey | null {
  if (!(err instanceof ServiceError)) return null;
  return SERVICE_ERROR_KEYS[err.code] ?? null;
}

/**
 * 把任意异常渲染成用户语言的一句话。
 *
 * 未登记的码退到调用方给的 fallbackKey——**不再退回 err.message**，那正是中文泄漏的来源。
 * 代价是丢诊断信息，所以同时打一条 console.error：用户看本地化文案，开发者看原文。
 * 这条日志出现即意味着上面的码表缺一行。
 */
export function formatServiceError(
  err: unknown,
  t: TFunction,
  fallbackKey: TranslationKey,
): string {
  const key = serviceErrorKey(err);
  if (!key) {
    console.error('[service-errors] 未映射的错误，已降级为兜底文案:', err);
    return t(fallbackKey);
  }
  return t(key, { message: err instanceof Error ? err.message : String(err) });
}
