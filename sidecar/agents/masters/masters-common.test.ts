import { readdirSync } from 'fs';
import { describe, test, expect } from 'bun:test';
import type { MasterAgent, MasterAnalysisContext } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';
import { MASTER_META } from '../../../shared/constants';
import { getAllMasters } from '../registry';

/**
 * 从 `shared/constants.ts` 的 MASTER_META 推导，**不再手工登记**。
 *
 * 手工表的失败模式是静默的：新增大师时漏加一行，这个套件照跑照绿，只是少测一位。
 * 现在表是唯一来源，下面 §「三处登记必须彼此一致」再双向钉住表 / 文件 / registry。
 */
const ALL_MASTER_FILES = MASTER_META.map((m) => m.id);

describe('三处登记必须彼此一致', () => {
  const filesOnDisk = readdirSync(import.meta.dir)
    .filter((f) => f.endsWith('.ts') && f !== 'factory.ts' && !f.includes('.test.'))
    .map((f) => f.slice(0, -3))
    .sort();

  /** 建了文件却忘了加进 MASTER_META——过去表现为「大师存在但前端不显示姓名」 */
  test('masters/ 目录里的文件与 MASTER_META 的 id 完全对应', () => {
    expect(filesOnDisk).toEqual([...ALL_MASTER_FILES].sort());
  });

  /** 加进表也建了文件，却忘了在 registry.ts 注册——表现为「设置里选得到，分析时静默跳过」 */
  test('registry 注册的大师与 MASTER_META 的 id 完全对应', () => {
    const registered = getAllMasters()
      .map((a) => a.meta.id)
      .sort();
    expect(registered).toEqual([...ALL_MASTER_FILES].sort());
  });
});

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: {
    signal: 'bullish',
    confidence: 70,
    details: { rsi: 55, adx: 28, alignment: 'bullish', macd_trend: 'expanding', volume_ratio: 1.2 },
  },
  fundamental: {
    signal: 'neutral',
    confidence: 55,
    details: { roe: 18, net_margin: 15, pe: 30, pb: 8, debt_to_asset: 45, revenue_growth: 8 },
  },
  composite: { signal: 'bullish', score: 64 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  {
    title: 'Company reports earnings',
    source: 'Reuters',
    date: '2026-05-20',
    content: 'Beat expectations',
    url: '',
  },
];

describe('all master agents share contract', () => {
  for (const file of ALL_MASTER_FILES) {
    describe(file, () => {
      test('module exports agent with correct id', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        expect(agent.meta.id).toBe(file);
        expect(agent.meta.name).toBeTruthy();
        expect(agent.meta.nameZh).toBeTruthy();
        expect(agent.meta.style).toBeTruthy();
        expect(agent.meta.styleZh).toBeTruthy();
      });

      test('analyze returns valid signal on success', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: {
            chat: async () =>
              JSON.stringify({ signal: 'bullish', confidence: 75, reasoning: '测试理由' }),
          },
        };
        const result = await agent.analyze(ctx);
        expect(result.masterId).toBe(file);
        expect(['bullish', 'bearish', 'neutral']).toContain(result.signal);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
        expect(result.reasoning).toBeTruthy();
      });

      test('analyze returns neutral on error', async () => {
        const mod = await import(`./${file}`);
        const agent: MasterAgent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: {
            chat: async () => {
              throw new Error('fail');
            },
          },
        };
        const result = await agent.analyze(ctx);
        expect(result.signal).toBe('neutral');
        expect(result.confidence).toBe(50);
      });
    });
  }
});
