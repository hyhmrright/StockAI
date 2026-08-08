// 服务响应信封：Sidecar stdout ↔ Rust ↔ 前端 parseServiceResponse 的唯一协议
/**
 * 服务端错误对象
 */
export interface ServiceErrorPayload {
  code: string; // 错误码，如 'ERR_SCRAPE_EMPTY', 'ERR_AI_AUTH'
  message: string; // 人类可读的消息
}

/**
 * 成功信封
 */
export interface SuccessEnvelope<T> {
  data: T;
  error?: never;
}

/**
 * 失败信封
 */
export interface ErrorEnvelope {
  data?: never;
  error: ServiceErrorPayload;
}

/**
 * 统一的业务响应信封（discriminated union；data 与 error 互斥）
 */
export type ServiceResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;
