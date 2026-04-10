/**
 * 从 unknown 类型的错误中安全提取消息字符串
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 为 Promise 添加超时控制
 * 超时后自动 reject，避免手动管理 setTimeout + clearTimeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * 标准化日志输出类
 * 所有非结构化信息通过 stderr 输出，不干扰 stdout 的主数据通道
 */
export const logger = {
  /** 一般信息 */
  info(msg: string) {
    console.error(`[INFO] ${msg}`);
  },
  /** 调试信息 */
  debug(msg: string) {
    console.error(`[DEBUG] ${msg}`);
  },
  /** 警告信息 */
  warn(msg: string) {
    console.error(`[WARN] ${msg}`);
  },
  /** 异常信息 */
  error(msg: string) {
    console.error(`[ERROR] ${msg}`);
  }
};

let _stdoutWritten = false;

/**
 * 标准化结果输出
 * 协议约定：每个 Sidecar 进程只允许调用一次，输出单行 JSON 后退出。
 * 重复调用视为协议违规，直接抛出异常防止静默数据损坏。
 */
export function outputJson(data: unknown): void {
  if (_stdoutWritten) {
    throw new Error('[PROTOCOL] outputJson called more than once in the same process');
  }
  _stdoutWritten = true;
  process.stdout.write(JSON.stringify(data) + '\n');
}

/** 仅供测试使用：重置写入防护状态 */
export function _resetOutputGuard(): void {
  _stdoutWritten = false;
}
