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

const LOG_FILENAME = 'sidecar.log';
/** 单个日志文件的体积上限，超过即轮转；连同 `.old` 一份，磁盘占用封顶 2 倍 */
const LOG_MAX_BYTES = 512 * 1024;

/**
 * 日志文件路径。
 *
 * 落点由 Rust 在 spawn 时经 `STOCKAI_LOG_DIR` 注入（Tauri 的 app log dir——跨平台标准
 * 位置、必然可写、用户能在设置里一键打开）。没有该变量说明是开发期直接跑 sidecar，
 * 退到临时目录即可。
 *
 * **刻意不再用可执行文件目录**：打包后那是 `.app/Contents/MacOS` 与 `Program Files`，
 * 装在系统目录时根本不可写；侥幸写成了也会被下一次应用更新连同旧二进制一起抹掉，
 * 而「更新后才复现的故障」恰恰最需要更新前的那段日志。
 */
function logFilePath(): string {
  const dir = process.env.STOCKAI_LOG_DIR ?? tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, LOG_FILENAME);
  } catch {
    // 注入的目录建不出来（权限/路径非法）时不能放弃落盘，退回临时目录
    return path.join(tmpdir(), LOG_FILENAME);
  }
}

/** 超过上限就把当前文件顶成 `.old`（覆盖上一份），无需扫目录也不会无限增长 */
function rotateIfOversized(file: string): void {
  const stat = fs.statSync(file, { throwIfNoEntry: false }); // 文件还不存在时给 undefined 而非抛
  if (!stat || stat.size < LOG_MAX_BYTES) return;
  fs.renameSync(file, `${file}.old`);
}

/**
 * 落盘前抹掉疑似凭据。
 *
 * 这份日志是**给用户当报障附件往 issue 里贴的**（设置里的「打开日志目录」就是这么引导的），
 * 所以「日志里碰巧没有 key」这种当下成立的巧合当不了保证：provider 的 401 原文常带半截
 * key，URL 携带鉴权的更是整串明文。抹在这里而不是各调用点，是因为这是所有落盘文本的唯一
 * 出口——将来新增的 `logger` 调用不必各自记得脱敏。
 *
 * **不追求穷尽**：只挡已知会出现在本项目 provider 报错里的几种形状。GLM 的 `{id}.{secret}`
 * 不单列——那个形状与域名、版本号无法区分，规则写宽了会把正常日志抹成马赛克；它经
 * Authorization 头发出，由下面的 Bearer 规则覆盖。
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'], // OpenAI / DeepSeek / Anthropic(sk-ant-) 同族
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***'],
  [/([?&](?:api[-_]?key|key|token|access[-_]?token)=)[^&\s]+/gi, '$1***'], // URL 查询串里的鉴权
];

function redactSecrets(msg: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, mask]) => acc.replace(pattern, mask), msg);
}

/**
 * 诊断日志落盘。
 *
 * 为什么非落盘不可：打包后的应用由 Finder / 开始菜单启动，stderr 没有终端可去——
 * sidecar 里几十处 `logger` 调用在生产环境等于全部丢弃，用户报障时手上一点证据都没有。
 */
export function logToFile(msg: string) {
  try {
    const file = logFilePath();
    rotateIfOversized(file);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${redactSecrets(msg)}\n`);
  } catch {
    // 写日志失败不该影响主流程，一律吞掉
  }
}

/**
 * 标准化日志输出类。
 *
 * **warn / error 落盘，info / debug 只进 stderr**：warn 记的是「降级发生了」——数据源
 * 回退、抓取策略失败、缓存写不进去，正是事后排障唯一能用的线索（K 线回退到不复权的
 * 中文源、三个新闻策略全挂被报成「请确认代码是否正确」，都只在这一级留痕）。info 是
 * 流水账，量大且绝大多数时候没有诊断价值，落盘只会把信号淹掉。
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
    logToFile(`WARN: ${msg}`);
  },
  error(msg: string) {
    console.error(`[SIDE-ERROR] ${msg}`);
    logToFile(`ERROR: ${msg}`);
  },
};

import type { SuccessEnvelope, ErrorEnvelope } from '../shared/types';

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

let _stdoutWritten = false;
/** 最终 JSON 真正落到管道后才 resolve；未写过则视为已刷完 */
let _flushed: Promise<void> = Promise.resolve();

/**
 * 仅用于测试：重置输出守护锁，允许在一个进程生命周期内多次输出 JSON
 */
export function _resetOutputGuard(): void {
  _stdoutWritten = false;
  _flushed = Promise.resolve();
}

/**
 * 标准化结果输出。写入是异步的：超过管道缓冲区（实测 64KB）的部分要等下游读走，
 * 因此这里记下完成回调，由 `exitAfterFlush` 等它落地后再退出——直接 `process.exit`
 * 会把深度分析、`--bundle` 这类大结果拦腰截断成非法 JSON。
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
  _flushed = new Promise<void>((resolve) => {
    process.stdout.write(output + '\n', () => resolve());
  });
}

/**
 * 刷完 stdout 后**强制**结束进程。
 *
 * Sidecar 是 spawn-per-call 的一次性进程：写完那行 JSON，它的活就干完了。但「活干完」
 * 不等于「进程会退出」——Bun 的事件循环只要还挂着活的句柄就不退，而 `browser-manager`
 * 的清理一旦撞上 `browserClose` 上限就会放弃等待，留下一个孤儿 Chromium 子进程和它的
 * 管道。此时答案早已躺在 stdout 里，Rust 侧却在 `rx.recv()` 上等管道关闭，等不到——
 * 整条 IPC 调用永不返回，UI 无限转圈（这正是给抓取加时间预算所要消灭的那类故障，
 * 只是换到了进程这一层）。
 *
 * 所以这里不依赖事件循环自然排空，写完即退。
 */
export async function exitAfterFlush(code: number): Promise<never> {
  await _flushed;
  process.exit(code);
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
