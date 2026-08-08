import { fetchRealtimeQuotes } from './ipc';
import { detectMarket, isTradingHours } from './market-hours';
import type { BatchQuoteResult } from '../../shared/types';

const POLL_MS = 10_000;

/**
 * 全应用共用的报价轮询——**只有一个**定时器、一次批量请求。
 *
 * 为什么必须是单例：sidecar 是 spawn-per-call。关注列表、持仓弹窗、指数条各自持一个
 * 轮询的话，交易时段每 10 秒就要起 3 个进程。这与 useAlertMonitor 从前逐只取价是同一
 * 类缺陷，不该在新功能里再犯一次。
 *
 * 各消费方注册自己关心的代码集合，store 取并集后一次拉完，再把整份结果广播出去；
 * 消费方按自己手里的代码查表即可（见 useQuotes）。
 *
 * 采用模块级单例而非 Context Provider，与 useSettings 的外部 store 同一套路——
 * 消费方散落在组件树各处，不必为此在根部包一层。
 */

const subscriptions = new Map<number, string[]>();
const listeners = new Set<() => void>();

let state: BatchQuoteResult = { quotes: {}, failed: [] };
let timer: ReturnType<typeof setInterval> | null = null;
let nextId = 0;
/** 每轮取数的代次；回调落地时若代次已变（期间发生过 reset），结果丢弃 */
let generation = 0;

function emit() {
  for (const listener of listeners) listener();
}

/** 当前所有订阅方关心的代码并集，排序去重 */
function union(): string[] {
  const all = new Set<string>();
  for (const symbols of subscriptions.values()) for (const s of symbols) all.add(s);
  return [...all].sort();
}

async function load(targets: string[]) {
  if (targets.length === 0) return;
  const gen = generation;
  // 整批抛出即数据源全挂，此时这批全部记为失败——比静静保留旧价诚实
  const result = await fetchRealtimeQuotes(targets).catch(
    (): BatchQuoteResult => ({ quotes: {}, failed: targets }),
  );
  if (gen !== generation) return;

  // 本轮涉及的代码先从旧 failed 里摘掉，再并入本轮的失败，避免失败标记永久粘住
  const failed = new Set(state.failed.filter((s) => !targets.includes(s)));
  for (const s of result.failed) failed.add(s);
  // 合并而非替换：本轮没取的代码要保留上一次的价，否则收盘那半边会集体变空
  state = { quotes: { ...state.quotes, ...result.quotes }, failed: [...failed] };
  emit();
}

/** 每 tick 只拉**当前处于交易时段**的代码。北京时间上午刷美股是纯浪费。 */
function tick() {
  void load(union().filter((s) => isTradingHours(detectMarket(s))));
}

function syncTimer() {
  const hasWork = subscriptions.size > 0 && union().length > 0;
  if (hasWork && !timer) timer = setInterval(tick, POLL_MS);
  else if (!hasWork && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 注册一组代码，返回注销函数。
 * 注册时立即拉一次**新出现的**代码（不看交易时段）：休市时也要给出"最后已知价格"，
 * 但已经有价的代码不必重拉。
 */
export function registerQuotes(symbols: string[]): () => void {
  const id = nextId++;
  subscriptions.set(id, symbols);
  syncTimer();

  const fresh = symbols.filter((s) => !(s in state.quotes));
  if (fresh.length > 0) void load(fresh);

  return () => {
    subscriptions.delete(id);
    syncTimer();
  };
}

export function getQuotesSnapshot(): BatchQuoteResult {
  return state;
}

export function subscribeQuotes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 仅供测试：清空单例状态。模块级 store 会跨用例泄漏，
 * 上一条用例残留的报价会让下一条"还没取数就已有值"。
 */
export function _resetQuotesStore(): void {
  generation++;
  subscriptions.clear();
  listeners.clear();
  state = { quotes: {}, failed: [] };
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
