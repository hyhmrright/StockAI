import { describe, test, expect } from 'bun:test';
import {
  createMasterAgent,
  formatFactorsForPrompt,
  formatFundFlowForPrompt,
  formatNewsForPrompt,
  PARSE_FAIL_MSG,
  SERVICE_UNAVAIL_MSG,
} from './factory';
import { agent as buffettAgent } from './warren-buffett';
import { agent as cathieAgent } from './cathie-wood';
import { agent as burryAgent } from './michael-burry';
import { agent as druckenmillerAgent } from './stanley-druckenmiller';
import { createMockQuantBundle, createMockNews } from '../../../shared/test-utils';
import type { MasterAgent, MasterAnalysisContext } from '../types';
import type {
  FundFlowData,
  MasterFactors,
  MasterMeta,
  QuantBundle,
  StockNews,
} from '../../../shared/types';

function makeNews(title: string, content: string): StockNews {
  return { title, content, source: 'test', date: '2026-05-31', url: 'https://example.com' };
}

const meta: MasterMeta = {
  id: 'test-master',
  name: 'Test Master',
  nameZh: '测试大师',
  style: 'test',
  styleZh: '测试风格',
};

function makeCtx(
  chatFn: (s: string, u: string) => Promise<string>,
  language?: 'zh' | 'en' | 'ja',
): MasterAnalysisContext {
  return {
    symbol: 'AAPL',
    quant: createMockQuantBundle(),
    news: [createMockNews()],
    chat: { chat: chatFn },
    language,
  };
}

describe('createMasterAgent', () => {
  test('成功响应返回解析后的 signal', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () =>
      JSON.stringify({
        signal: 'bearish',
        confidence: 80,
        reasoning: '估值过高',
      }),
    );
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('bearish');
    expect(result.confidence).toBe(80);
    expect(result.reasoning).toBe('估值过高');
  });

  test('LLM 返回非法 JSON → neutral 回退', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => 'this is not json at all');
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toBe(PARSE_FAIL_MSG['zh']);
  });

  test('LLM 抛错 → neutral 回退并含"暂不可用"', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => {
      throw new Error('network timeout');
    });
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('test-master');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toBe(SERVICE_UNAVAIL_MSG['zh']);
  });

  test('language=en: 非法 JSON → 英文回退消息', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => 'not json', 'en');
    const result = await agent.analyze(ctx);
    expect(result.reasoning).toBe('Response parse failed');
  });

  test('language=en: LLM 抛错 → 英文服务不可用消息', async () => {
    const agent = createMasterAgent(meta, 'system', () => 'user');
    const ctx = makeCtx(async () => {
      throw new Error('fail');
    }, 'en');
    const result = await agent.analyze(ctx);
    expect(result.reasoning).toBe('Analysis service unavailable');
  });

  test('language=en: system prompt 包含英文语言指令', async () => {
    const agent = createMasterAgent(meta, 'system prompt', () => 'user');
    let capturedSystem = '';
    const ctx = makeCtx(async (s) => {
      capturedSystem = s;
      return JSON.stringify({ signal: 'neutral', confidence: 50, reasoning: 'ok' });
    }, 'en');
    await agent.analyze(ctx);
    expect(capturedSystem).toContain('Respond in English');
    expect(capturedSystem).not.toContain('用中文回复');
  });
});

describe('formatNewsForPrompt', () => {
  test('有正文：标题后附正文摘要', () => {
    const lines = formatNewsForPrompt([makeNews('利好消息', '公司发布了强劲财报')]);
    expect(lines[0]).toBe('1. 利好消息\n   公司发布了强劲财报');
  });

  test('无正文（空字符串）：仅标题', () => {
    const lines = formatNewsForPrompt([makeNews('仅标题新闻', '')]);
    expect(lines[0]).toBe('1. 仅标题新闻');
  });

  test('正文超长按 bodyChars 截断', () => {
    const lines = formatNewsForPrompt([makeNews('长文', 'x'.repeat(500))], 5, 200);
    // "1. 长文\n   " 前缀 + 200 个 x
    expect(lines[0].endsWith('x'.repeat(200))).toBe(true);
    expect(lines[0]).not.toContain('x'.repeat(201));
  });

  test('超过 maxItems 只取前 N 条并保留序号', () => {
    const news = Array.from({ length: 8 }, (_, i) => makeNews(`新闻${i}`, ''));
    const lines = formatNewsForPrompt(news, 5);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('5. 新闻4');
  });

  test('仅空白的正文视为无正文', () => {
    const lines = formatNewsForPrompt([makeNews('标题', '   \n  ')]);
    expect(lines[0]).toBe('1. 标题');
  });
});

const FACTORS_AVAILABLE: MasterFactors = {
  available: true,
  asOf: '2024-12-31',
  annualPeriods: 6,
  roeConsistency: {
    threshold: 15,
    streak: 6,
    periodsAbove: 6,
    totalPeriods: 6,
    avgRoe: 25,
    verdict: 'wide',
  },
  marginTrend: { gross: { latest: 91.5, direction: 'up', deltaPp: 2.5 } },
  debtTrend: { latest: 18, avg: 23, direction: 'falling' },
  growthStability: {
    revenue: { avgGrowth: 12.5, positivePeriods: 6, totalPeriods: 6, stability: 'stable' },
  },
  simpleDcf: { intrinsicValuePerShare: 1234.5, basis: 'ocfps', assumedGrowthPct: 12, note: 'x' },
};

describe('formatFactorsForPrompt', () => {
  test('available:false → 返回空数组（大师回退单期）', () => {
    expect(formatFactorsForPrompt({ available: false, annualPeriods: 2 })).toEqual([]);
  });

  test('undefined → 返回空数组', () => {
    expect(formatFactorsForPrompt(undefined)).toEqual([]);
  });

  test('available:true → 首行含 [预计算因子] 且带各因子标签', () => {
    const lines = formatFactorsForPrompt(FACTORS_AVAILABLE);
    expect(lines[0]).toContain('[预计算因子]');
    expect(lines[0]).toContain('6 期年报');
    const joined = lines.join('\n');
    expect(joined).toContain('护城河');
    expect(joined).toContain('毛利率趋势');
    expect(joined).toContain('负债率趋势');
    expect(joined).toContain('简化DCF');
  });
});

async function captureUserPrompt(
  agent: MasterAgent,
  factors?: MasterFactors,
  quant: QuantBundle = createMockQuantBundle(),
): Promise<string> {
  let captured = '';
  const ctx: MasterAnalysisContext = {
    symbol: 'TEST',
    quant,
    news: [createMockNews()],
    chat: {
      chat: async (_s, u) => {
        captured = u;
        return JSON.stringify({ signal: 'neutral', confidence: 50, reasoning: 'ok' });
      },
    },
    factors,
  };
  await agent.analyze(ctx);
  return captured;
}

describe('因子接线（消费者 vs 非消费者）', () => {
  test('消费者（warren-buffett）：available:true 时 prompt 含因子段', async () => {
    const prompt = await captureUserPrompt(buffettAgent, FACTORS_AVAILABLE);
    expect(prompt).toContain('[预计算因子]');
  });

  test('消费者（warren-buffett）：无因子时 prompt 不含因子段', async () => {
    const prompt = await captureUserPrompt(buffettAgent, undefined);
    expect(prompt).not.toContain('[预计算因子]');
  });

  test('非消费者（cathie-wood）：即便传入因子也不注入 prompt', async () => {
    const prompt = await captureUserPrompt(cathieAgent, FACTORS_AVAILABLE);
    expect(prompt).not.toContain('[预计算因子]');
  });
});

const FUND_FLOW: FundFlowData = {
  date: '2026-08-10',
  mainNet: -1.23e8,
  superLargeNet: -8e7,
  largeNet: -4.3e7,
  mediumNet: 3e7,
  smallNet: 9.3e7,
  mainNetPct: -5.2,
};

describe('formatFundFlowForPrompt', () => {
  test('undefined（美股无资金流）→ 返回空数组', () => {
    expect(formatFundFlowForPrompt(undefined)).toEqual([]);
  });

  test('有数据 → 首行含 [资金流向] 与数据日期，净额换算为亿元且带符号', () => {
    const lines = formatFundFlowForPrompt(FUND_FLOW);
    expect(lines[0]).toContain('[资金流向]');
    expect(lines[0]).toContain('2026-08-10');
    const joined = lines.join('\n');
    // 元 → 亿元：-1.23e8 必须显示为 -1.23亿，而非 9 位原始数字
    expect(joined).toContain('-1.23亿');
    expect(joined).not.toContain('123000000');
    expect(joined).toContain('-5.2%');
    // 流入方向靠符号表达，正数必须带 +（LLM 才能一眼分辨流入/流出）
    expect(joined).toContain('+0.30亿');
  });

  test('新浪备源无 date → 首行不带括号日期，其余照常', () => {
    const lines = formatFundFlowForPrompt({ ...FUND_FLOW, date: undefined });
    expect(lines[0]).toBe('[资金流向]');
    expect(lines.join('\n')).toContain('-1.23亿');
  });
});

describe('资金流接线（市场行为派 vs 价值派）', () => {
  const withFlow = createMockQuantBundle({ fundFlow: FUND_FLOW });

  for (const [name, agent] of [
    ['stanley-druckenmiller', druckenmillerAgent],
    ['michael-burry', burryAgent],
    ['cathie-wood', cathieAgent],
  ] as const) {
    test(`消费者（${name}）：有资金流时注入 prompt`, async () => {
      const prompt = await captureUserPrompt(agent, undefined, withFlow);
      expect(prompt).toContain('[资金流向]');
      expect(prompt).toContain('-1.23亿');
    });

    test(`消费者（${name}）：美股无资金流时 prompt 不含该段`, async () => {
      const prompt = await captureUserPrompt(agent, undefined, createMockQuantBundle());
      expect(prompt).not.toContain('[资金流向]');
    });
  }

  test('非消费者（warren-buffett）：即便有资金流也不注入——日频资金流是价值框架的噪声', async () => {
    const prompt = await captureUserPrompt(buffettAgent, undefined, withFlow);
    expect(prompt).not.toContain('[资金流向]');
  });
});
