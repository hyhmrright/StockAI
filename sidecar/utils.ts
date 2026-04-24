import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * 获取当前执行二进制文件所在的目录
 * 在 Bun --compile 编译后的二进制中，Bun.main 是可执行文件的绝对路径
 */
export function getExecutableDir(): string {
  // @ts-ignore - Bun.main is available at runtime in Bun
  const mainPath = Bun.main;
  return path.dirname(mainPath);
}

/**
 * 从 unknown 类型的错误中安全提取消息字符串
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
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
  }
};

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
  if (_stdoutWritten) return;
  _stdoutWritten = true;
  try {
    const output = JSON.stringify(data);
    fs.writeSync(1, output + '\n');
  } catch (err) {
    const msg = `JSON 序列化失败: ${toErrorMessage(err)}`;
    console.error(`[SIDE-ERROR] ${msg}`);
    logToFile(msg);
  }
}

/**
 * 为 Promise 添加超时控制
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
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
