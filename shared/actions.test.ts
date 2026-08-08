import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SIDECAR_ACTIONS, CONFIG_SLOT, PAYLOAD_SLOT, buildActionArgs } from './actions';

const repoRoot = join(import.meta.dir, '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8');

describe('动作清单 ↔ 三层布线的一致性', () => {
  const ipcSource = read('src/lib/ipc.ts');
  const dispatchSource = read('sidecar/index.ts');

  test('每个 action 都在 sidecar 的 DISPATCH 表里有分发', () => {
    for (const [name, def] of Object.entries(SIDECAR_ACTIONS)) {
      expect(dispatchSource).toContain(`SIDECAR_ACTIONS.${name}.flag]`);
      expect(def.flag.startsWith('--')).toBe(true);
    }
  });

  // 这条守卫针对的正是历史上真实发生过的缺陷：sidecar handler 与 Rust command 都写好了，
  // 前端却没有调用方，于是「预热 RAG 索引」这类优化写完了却从未生效。
  test('ipc:true 的 action 必须在 ipc.ts 有调用方，ipc:false 的必须没有', () => {
    for (const [name, def] of Object.entries(SIDECAR_ACTIONS)) {
      const referenced = ipcSource.includes(`SIDECAR_ACTIONS.${name}`);
      expect(referenced).toBe(def.ipc);
    }
  });

  test('flag 唯一，不存在两个 action 抢同一个标志', () => {
    const flags = Object.values(SIDECAR_ACTIONS).map((a) => a.flag);
    expect(new Set(flags).size).toBe(flags.length);
  });

  // 哨兵字面量是 TS ↔ Rust ↔ 桥接器三方的握手；Rust 侧另有
  // test_slot_sentinels_match_shared_manifest 从 Rust 方向校验同一对常量。
  test('哨兵字面量固定不变', () => {
    expect(CONFIG_SLOT).toBe('@config');
    expect(PAYLOAD_SLOT).toBe('@payload');
  });
});

describe('buildActionArgs', () => {
  test('按 slots 顺序排参，flag 在首位', () => {
    const args = buildActionArgs(SIDECAR_ACTIONS.bundle, {
      configStr: CONFIG_SLOT,
      actionParam: '600519',
    });
    expect(args).toEqual(['--bundle', '@config', '600519']);
  });

  test('缺省槽位补空串，消除位置歧义（下游按固定位取参）', () => {
    const args = buildActionArgs(SIDECAR_ACTIONS.deepAnalysis, {
      configStr: CONFIG_SLOT,
      actionParam: 'AAPL',
      newsJson: PAYLOAD_SLOT,
    });
    expect(args).toEqual(['--deep-analysis', '@config', 'AAPL', '@payload', '', '']);
    expect(args).toHaveLength(1 + SIDECAR_ACTIONS.deepAnalysis.slots.length);
  });

  test('无参数 action 只产出 flag', () => {
    expect(buildActionArgs(SIDECAR_ACTIONS.marketSnapshot, {})).toEqual(['--market-snapshot']);
  });
});
