import { describe, expect, test } from 'bun:test';
import { parseArgs } from './index';
import { SIDECAR_ACTIONS, CONFIG_SLOT, buildActionArgs } from '../shared/actions';

/** 模拟真实 argv：[bunPath, entryPath, ...实参] */
const argv = (...args: string[]) => ['/bin/bun', '/app/index.ts', ...args];

describe('parseArgs 按 shared 清单取参', () => {
  test('单参数 action', () => {
    expect(parseArgs(argv('--quant', '600519'))).toEqual({
      action: '--quant',
      actionParam: '600519',
    });
  });

  test('无参数 action', () => {
    expect(parseArgs(argv('--market-snapshot'))).toEqual({ action: '--market-snapshot' });
  });

  test('config + symbol 按 slots 顺序落位', () => {
    expect(parseArgs(argv('--bundle', '@/tmp/stockai-config-1.json', '600519'))).toEqual({
      action: '--bundle',
      configStr: '@/tmp/stockai-config-1.json',
      actionParam: '600519',
    });
  });

  test('五槽位 action 全部落位，空槽保持空串', () => {
    const parsed = parseArgs(
      argv('--deep-analysis', '@/tmp/stockai-config-1.json', 'AAPL', '/tmp/news.json', '', '[]'),
    );
    expect(parsed).toEqual({
      action: '--deep-analysis',
      configStr: '@/tmp/stockai-config-1.json',
      actionParam: 'AAPL',
      newsJson: '/tmp/news.json',
      quantJson: '',
      weightsJson: '[]',
    });
  });

  test('--fundamentals-history 复用 newsJson 槽位承载 periods', () => {
    expect(parseArgs(argv('--fundamentals-history', '600519', '20'))).toMatchObject({
      action: '--fundamentals-history',
      actionParam: '600519',
      newsJson: '20',
    });
  });

  describe('默认分析模式（无 flag）', () => {
    test('symbol 紧邻 @config 之前', () => {
      expect(parseArgs(argv('600519', '@/tmp/stockai-config-1.json'))).toEqual({
        action: '',
        actionParam: '600519',
        configStr: '@/tmp/stockai-config-1.json',
      });
    });

    test('内联 JSON 配置同样识别', () => {
      expect(parseArgs(argv('AAPL', '{"_version":"3"}'))).toEqual({
        action: '',
        actionParam: 'AAPL',
        configStr: '{"_version":"3"}',
      });
    });

    test('完全没有配置参数时退化为「末位当 symbol」', () => {
      expect(parseArgs(argv('600519'))).toEqual({
        action: '',
        actionParam: '600519',
        configStr: '{}',
      });
    });
  });

  // 回归保护：动作标志恒在参数之前，取最左侧的才对。若改成「按 action 声明顺序去 argv 里找」，
  // 用户传入的值会抢戏——选股 query 含 "--quant" 时 --screen 会被误派成 --quant。
  test('用户传入的值恰好等于另一个 flag 时，仍按最左侧的动作分发', () => {
    expect(parseArgs(argv('--screen', '@/tmp/stockai-config-1.json', '--quant'))).toEqual({
      action: '--screen',
      configStr: '@/tmp/stockai-config-1.json',
      actionParam: '--quant',
    });
  });

  test('symbol 恰好等于某 flag 时不影响已确定的动作', () => {
    expect(parseArgs(argv('--quote', '--backtest'))).toEqual({
      action: '--quote',
      actionParam: '--backtest',
    });
  });

  // 端到端契约：前端用 buildActionArgs 组装的 argv，sidecar 必须原样解回
  test('与 buildActionArgs 往返一致（前端组装 → sidecar 解析）', () => {
    for (const def of Object.values(SIDECAR_ACTIONS)) {
      const values: Record<string, string> = {};
      def.slots.forEach((slot, i) => {
        values[slot] = slot === 'configStr' ? CONFIG_SLOT : `v${i}`;
      });
      const parsed = parseArgs(argv(...buildActionArgs(def, values)));
      expect(parsed.action).toBe(def.flag);
      for (const slot of def.slots) {
        expect(parsed[slot]).toBe(values[slot]);
      }
    }
  });
});
