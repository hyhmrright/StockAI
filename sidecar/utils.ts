import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * 获取当前执行二进制文件所在的目录
 * 在 Bun --compile 编译后的二进制中，Bun.main 是可执行文件的绝对路径
 */
export function getExecutableDir(): string {
  // @ts-ignore - Bun.main 在编译后的二进制中可用；测试环境回退到 process.argv[1]
  const mainPath = typeof Bun !== 'undefined' && Bun.main ? Bun.main : process.argv[1];
  return path.dirname(mainPath);
}

/**
 * 从 unknown 类型的错误中安全提取消息字符串
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 紧急日志：直接写入文件，用于调试 Sidecar 启动问题
 * 优先使用可执行文件目录，如果不可写则使用系统临时目录
 */
export function logToFile(msg: string) {
  try {
    const time = new Date().toISOString();
    const logMsg = `[${time}] ${msg}\n`;

    // 尝试在可执行文件同级写日志 (便于调试)
    const exeDir = getExecutableDir();
    const primaryLogPath = path.join(exeDir, 'sidecar_debug.log');

    try {
      fs.appendFileSync(primaryLogPath, logMsg);
      return;
    } catch (e) {
      // 如果不可写，尝试临时目录
      const fallbackLogPath = path.join(tmpdir(), 'stockai_sidecar_debug.log');
      fs.appendFileSync(fallbackLogPath, logMsg);
    }
  } catch (e) {
    // 彻底忽略日志写入错误
  }
}

/**
 * 标准化日志输出类
 */
export const logger = {
  info(msg: string) {
    console.error(`[SIDE-INFO] ${msg}`);
  },
  debug(msg: string) {
    console.error(`[SIDE-DEBUG] ${msg}`);
  },
  warn(msg: string) {
    console.error(`[SIDE-WARN] ${msg}`);
  },
  error(msg: string) {
    console.error(`[SIDE-ERROR] ${msg}`);
    logToFile(`ERROR: ${msg}`);
  },
};

import type { SuccessEnvelope, ErrorEnvelope, ServiceErrorPayload } from '../shared/types';

/**
 * 构造成功信封（强类型，避免散落各处写错字段名）
 */
export function successEnvelope<T>(data: T): SuccessEnvelope<T> {
  return { data };
}

/**
 * 构造错误信封
 */
export function errorEnvelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

/**
 * 从 unknown 错误构造错误信封（用于 catch 块的快捷写法）
 */
export function errorEnvelopeFromUnknown(code: string, error: unknown): ErrorEnvelope {
  return errorEnvelope(code, toErrorMessage(error));
}

/** 类型守卫：判断信封是否为成功响应（编译期 + 运行期双重校验） */
export function isSuccess<T>(env: {
  data?: T;
  error?: ServiceErrorPayload;
}): env is SuccessEnvelope<T> {
  return env.error === undefined && env.data !== undefined;
}

let _stdoutWritten = false;

/**
 * 仅用于测试：重置输出守护锁，允许在一个进程生命周期内多次输出 JSON
 */
export function _resetOutputGuard(): void {
  _stdoutWritten = false;
}

/**
 * 标准化结果输出
 * 采用 fs.writeSync 确保同步、无缓冲地写入 stdout (fd: 1)
 */
export function outputJson(data: unknown): void {
  if (_stdoutWritten) {
    throw new Error('[PROTOCOL] outputJson 只能调用一次，检测到重复写入');
  }
  let output: string;
  try {
    output = JSON.stringify(data);
  } catch (err) {
    const msg = toErrorMessage(err);
    logToFile(`JSON 序列化失败: ${msg}`);
    // 序列化失败时仍写出有效的错误 JSON，确保 Tauri 端能解析响应
    output = JSON.stringify(errorEnvelope('ERR_SERIALIZE', `JSON 序列化失败: ${msg}`));
  }
  _stdoutWritten = true;
  process.stdout.write(output + '\n');
}

/**
 * 为 Promise 添加超时控制；超时抛出的 Error 上 `name='TimeoutError'`，供分类器识别
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(message);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * 列模型错误码（与前端 ProviderForm 显示提示对齐）
 * - TIMEOUT：请求超时
 * - AUTH：401/403，鉴权失败
 * - NETWORK：连接拒绝/DNS/网络层异常
 * - SERVER：5xx，服务器内部错误
 * - BAD_REQUEST：4xx 非鉴权（多为配置错误）
 * - UNKNOWN：兜底
 */
export type ListModelsErrorCode =
  | 'ERR_LIST_MODELS_TIMEOUT'
  | 'ERR_LIST_MODELS_AUTH'
  | 'ERR_LIST_MODELS_NETWORK'
  | 'ERR_LIST_MODELS_SERVER'
  | 'ERR_LIST_MODELS_BAD_REQUEST'
  | 'ERR_LIST_MODELS';

/**
 * 把列模型链路抛出的各种错误（fetch / Ollama / OpenAI SDK）映射到稳定错误码。
 * 入参 unknown，永不抛出。
 */
export function classifyListModelsError(error: unknown): {
  code: ListModelsErrorCode;
  message: string;
} {
  const message = toErrorMessage(error);

  // 超时（withTimeout 抛出，name 已标记）
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { code: 'ERR_LIST_MODELS_TIMEOUT', message };
  }

  // 优先匹配 HTTP 状态码（OpenAI SDK 错误带 status，fetch Response 也带）
  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : undefined;
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return { code: 'ERR_LIST_MODELS_AUTH', message };
    }
    if (status >= 500) {
      return { code: 'ERR_LIST_MODELS_SERVER', message };
    }
    if (status >= 400) {
      return { code: 'ERR_LIST_MODELS_BAD_REQUEST', message };
    }
  }

  // 网络层关键词：connection refused / ECONNREFUSED / fetch failed / ENOTFOUND
  const lowered = message.toLowerCase();
  if (
    lowered.includes('econnrefused') ||
    lowered.includes('connection refused') ||
    lowered.includes('fetch failed') ||
    lowered.includes('enotfound') ||
    lowered.includes('network') ||
    lowered.includes('getaddrinfo')
  ) {
    return { code: 'ERR_LIST_MODELS_NETWORK', message };
  }

  // 文本兜底：消息里含 unauthorized / invalid api key
  if (
    lowered.includes('unauthorized') ||
    lowered.includes('invalid api key') ||
    lowered.includes('invalid_api_key')
  ) {
    return { code: 'ERR_LIST_MODELS_AUTH', message };
  }

  return { code: 'ERR_LIST_MODELS', message };
}

/** 返回当前日期的 ISO 字符串 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 从 AI 返回的文本中提取并解析 JSON
 */
export function parseJsonFromAi<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s+/, '').replace(/\s*```$/, '');
  }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`AI 返回格式非 JSON: ${toErrorMessage(err)}`);
  }
}
