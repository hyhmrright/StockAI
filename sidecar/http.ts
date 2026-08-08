import { HTTP_DEFAULTS } from './config';

/**
 * 外部数据源 HTTP 抓取的统一入口。
 *
 * 存在的理由：「用什么 UA、给多久超时」是一个决策，必须只表达一次。
 * 各数据源模块（kline / quant / rag / search / stock-info）一律经此调用，
 * 不要再各写 `AbortSignal.timeout(...)` 或自己的 User-Agent 字面量。
 */
export interface FetchPolicy {
  /** 超时毫秒，缺省 HTTP_DEFAULTS.timeoutMs；重接口用 HTTP_DEFAULTS.slowTimeoutMs */
  timeoutMs?: number;
  /** 附加请求头（如 Referer）；同名 key 覆盖默认 User-Agent */
  headers?: Record<string, string>;
  /** HTTP 方法，缺省 GET */
  method?: string;
  /** 请求体（POST 表单/JSON） */
  body?: BodyInit;
  /** 测试注入点：替换真实网络，保持数据源模块离线可测 */
  fetchImpl?: typeof fetch;
}

/** 按统一策略发起请求：注入默认 UA 与超时，其余交给调用方 */
export function fetchWithPolicy(url: string, policy: FetchPolicy = {}): Promise<Response> {
  const { timeoutMs = HTTP_DEFAULTS.timeoutMs, headers, method, body, fetchImpl = fetch } = policy;
  return fetchImpl(url, {
    method,
    body,
    headers: { 'User-Agent': HTTP_DEFAULTS.userAgent, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}
