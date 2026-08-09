// Sidecar CLI 动作清单——「一个能力叫什么、吃哪些参数」的跨层唯一来源。
//
// 三层各自从这里派生，不再手工同步：
//   - Sidecar（sidecar/index.ts）：按 flag 匹配 argv，按 slots 逐位取参，再查表分发到 handler
//   - Tauri Core（src-tauri/src/lib.rs）：单个泛化 invoke_sidecar 命令，只认下面两个哨兵，不认具体 action
//   - 前端（src/lib/ipc.ts）：按 flag + slots 组装 argv
//
// 新增一个能力 = 本文件加一条 + cli-handlers/ 对应领域文件实现 handler + index.ts 的 DISPATCH 加一行。
// Rust 与 ipc.ts 的调用管道无需改动。

/**
 * argv 哨兵：配置槽位。Rust/桥接器把它替换为 0o600 临时配置文件的 `@路径`。
 * 含 apiKey 的配置永不进 argv（`ps` / 活动监视器可见），故必须走文件。
 */
export const CONFIG_SLOT = '@config';

/**
 * argv 哨兵：大 payload 槽位（news 数组 / chat payload）。
 * Rust/桥接器把它替换为临时 JSON 文件的裸路径，规避 macOS ARG_MAX(~256KB)。
 */
export const PAYLOAD_SLOT = '@payload';

/** 参数槽位名——与 sidecar/index.ts 的 ParsedArgs 字段一一对应 */
export type SlotName = 'configStr' | 'actionParam' | 'newsJson' | 'quantJson' | 'weightsJson';

export interface SidecarActionDef {
  /** CLI flag（argv 中的动作标志） */
  readonly flag: string;
  /** flag 之后的参数槽位，按 argv 顺序排列 */
  readonly slots: readonly SlotName[];
  /**
   * 是否经 Rust/前端 IPC 调用。false = 仅 CLI 调试入口（无前端调用方），
   * 由 shared/actions.test.ts 与 ipc.ts 的导出表交叉校验，防止再出现「布线只接一半」的死链路。
   */
  readonly ipc: boolean;
}

/** 全部 CLI 动作（默认分析模式无 flag，单独见下方 DEFAULT_ANALYSIS_SLOTS） */
export const SIDECAR_ACTIONS = {
  listModels: { flag: '--list-models', slots: ['configStr'], ipc: true },
  search: { flag: '--search', slots: ['actionParam'], ipc: true },
  kline: { flag: '--kline', slots: ['actionParam'], ipc: true },
  quote: { flag: '--quote', slots: ['actionParam'], ipc: true },
  // 批量报价：actionParam 是逗号分隔的代码表。sidecar 是 spawn-per-call，逐只调 --quote
  // 会让一个 10 只的关注列表每轮起 10 个进程，故单开一个动作一次拉完。
  quotes: { flag: '--quotes', slots: ['actionParam'], ipc: true },
  bundle: { flag: '--bundle', slots: ['configStr', 'actionParam'], ipc: true },
  analyzeOnly: {
    flag: '--analyze-only',
    slots: ['configStr', 'actionParam', 'newsJson', 'quantJson'],
    ipc: true,
  },
  quant: { flag: '--quant', slots: ['actionParam'], ipc: true },
  // 板块涨幅榜（行业 + 概念）。无参数：榜单是全市场的，不针对某只标的。
  sectors: { flag: '--sectors', slots: [], ipc: true },
  // 龙虎榜（最新交易日的净买入 / 净卖出榜）。同为全市场榜单，无参数。
  billboard: { flag: '--billboard', slots: [], ipc: true },
  indexReports: { flag: '--index-reports', slots: ['actionParam'], ipc: true },
  backtest: { flag: '--backtest', slots: ['actionParam'], ipc: true },
  deepAnalysis: {
    flag: '--deep-analysis',
    slots: ['configStr', 'actionParam', 'newsJson', 'quantJson', 'weightsJson'],
    ipc: true,
  },
  chat: { flag: '--chat', slots: ['configStr', 'actionParam'], ipc: true },
  screen: { flag: '--screen', slots: ['configStr', 'actionParam'], ipc: true },
  // ── 以下仅 CLI 调试入口：业务链路里由 sidecar 内部直接调用对应函数，不经 IPC ──
  // 历史财务：deep-analysis.ts 直接调 fetchFinancialHistory
  fundamentalsHistory: {
    flag: '--fundamentals-history',
    slots: ['actionParam', 'newsJson'],
    ipc: false,
  },
  // 全市场快照：quant/nl-screen.ts 直接调 fetchMarketSnapshot
  marketSnapshot: { flag: '--market-snapshot', slots: [], ipc: false },
  // 单股基本信息：业务链路由 --bundle 一并返回
  info: { flag: '--info', slots: ['actionParam'], ipc: false },
} as const satisfies Record<string, SidecarActionDef>;

/** 默认分析模式（无 flag）：`<symbol> <@config>`，为兼容旧调用保留 */
export const DEFAULT_ANALYSIS_SLOTS = ['actionParam', 'configStr'] as const;

/** 按 flag 组装 argv：[flag, ...按 slots 顺序的值]。缺省槽位补空串以消除位置歧义。 */
export function buildActionArgs(
  action: SidecarActionDef,
  values: Partial<Record<SlotName, string>>,
): string[] {
  return [action.flag, ...action.slots.map((slot) => values[slot] ?? '')];
}
