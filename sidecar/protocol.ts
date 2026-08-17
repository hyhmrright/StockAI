import type { SuccessEnvelope, ErrorEnvelope } from '../shared/types';
import { toErrorMessage } from './utils';
import { logToFile } from './log';

/**
 * Sidecar 与 Rust 之间的 stdout 协议：信封形状 + 「只写一次、写完即退」这一个不变量。
 *
 * `outputJson` 与 `exitAfterFlush` 共享私有的 `_flushed`，所以它们必须同处一个模块——
 * 拆开就得把这个内部状态导出去，等于把「什么时候才算写完」这个决策泄漏给调用方。
 * 信封工厂放在一起，是因为它们描述的正是这条管道上流的那个 JSON 长什么样。
 */

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
