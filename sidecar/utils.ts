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
    console.error(`[SIDE-INFO] ${msg}`);
  },
  /** 调试信息 */
  debug(msg: string) {
    console.error(`[SIDE-DEBUG] ${msg}`);
  },
  /** 警告信息 */
  warn(msg: string) {
    console.error(`[SIDE-WARN] ${msg}`);
  },
  /** 异常信息 */
  error(msg: string) {
    console.error(`[SIDE-ERROR] ${msg}`);
  }
};

let _stdoutWritten = false;

/**
 * 标准化结果输出
 * 协议约定：每个 Sidecar 进程只允许调用一次，输出单行 JSON 后退出。
 * 如果多次调用，第二次调用将被忽略并记录警告（而非抛出异常导致进程崩溃）。
 */
export function outputJson(data: unknown): void {
  if (_stdoutWritten) {
    logger.warn('[PROTOCOL] outputJson called more than once, second call ignored.');
    return;
  }
  _stdoutWritten = true;
  try {
    const output = JSON.stringify(data);
    process.stdout.write(output + '\n');
    // 在某些环境下，stdout 缓冲区可能不会立即刷新
    // 虽然 Node/Bun 的 stdout 通常在 TTY 下是同步的，但在管道下可能是异步的
  } catch (err) {
    logger.error(`JSON 序列化失败: ${toErrorMessage(err)}`);
  }
}

/** 仅供测试使用：重置写入防护状态 */
export function _resetOutputGuard(): void {
  _stdoutWritten = false;
}

/** 返回当前日期的 ISO 字符串（YYYY-MM-DD） */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 从 AI 返回的文本中提取并解析 JSON
 * 能够处理常见的 Markdown 代码块包裹情况 (```json ... ```)
 */
export function parseJsonFromAi<T>(text: string): T {
  let cleaned = text.trim();
  
  // 移除开头的 ```json 或 ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s+/, '');
  }
  
  // 移除结尾的 ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  // 有时 AI 会在 JSON 前后加一些废话，尝试通过寻找第一个 { 和最后一个 } 来提取
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.error(`AI 响应解析 JSON 失败. 原始内容: ${text.substring(0, 100)}... 错误: ${toErrorMessage(err)}`);
    throw new Error(`AI 返回的不是有效的 JSON 格式: ${toErrorMessage(err)}`);
  }
}
