import * as path from 'path';

/**
 * 通用小工具：不属于任何一个领域、也不承载任何决策的那几个函数。
 *
 * **加东西前先问一句「它会因为什么理由改变」**：日志口径去 `log.ts`，stdout 协议去
 * `protocol.ts`，某个 provider 的错误分类去它自己的 handler。这个文件曾经装下了以上全部，
 * 于是它同时因四种理由改变，还拖着 41 个 importer 一起重编译。
 */

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
 * 定量并发地跑一批任务，结果按入参顺序返回。
 *
 * 语义与 `Promise.all` 一致：**任何一个任务抛出，整体就抛出**。需要「单个失败不拖垮整批」
 * 的调用方（如批量报价）自己在 task 里 catch —— 把容错塞进这个池子会让「一个都不能少」
 * 的调用方（大师分析）失去失败信号。
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
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
