# Phase 2: Multi-Agent Master Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 investor persona agents that independently analyze stocks via LLM, plus a sentiment agent and synthesizer, exposed through a "deep analysis" mode in the UI.

**Architecture:** Sidecar gains a new `agents/` module with a registry of master agents. When `masterAnalysis=true` flows through config, the orchestrator in `deep-analysis.ts` runs selected masters + sentiment in parallel, then a synthesizer produces a combined signal. The frontend renders results in a card-based layout. The Rust layer is unchanged (config passthrough).

**Tech Stack:** TypeScript/Bun (sidecar), React/Tailwind (frontend), OpenAI SDK (LLM calls reusing existing providers)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `sidecar/agents/types.ts` | Create | Core interfaces: MasterMeta, MasterSignal, SentimentSignal, DeepAnalysisResult, MasterAgent, MasterAnalysisContext |
| `sidecar/agents/registry.ts` | Create | Master registry: maps IDs to agent modules, provides lookup + default selection |
| `sidecar/agents/sentiment.ts` | Create | Sentiment agent: LLM-based news classification → SentimentSignal |
| `sidecar/agents/synthesizer.ts` | Create | Aggregates master signals + sentiment → synthesis via local computation + LLM summary |
| `sidecar/agents/masters/warren-buffett.ts` | Create | Buffett agent: value investing, moat, margin of safety |
| `sidecar/agents/masters/ben-graham.ts` | Create | Graham agent: deep value, net-net, earnings stability |
| `sidecar/agents/masters/charlie-munger.ts` | Create | Munger agent: quality at fair price |
| `sidecar/agents/masters/michael-burry.ts` | Create | Burry agent: contrarian deep value |
| `sidecar/agents/masters/cathie-wood.ts` | Create | Wood agent: disruptive innovation |
| `sidecar/agents/masters/peter-lynch.ts` | Create | Lynch agent: PEG, ten-baggers |
| `sidecar/agents/masters/phil-fisher.ts` | Create | Fisher agent: scuttlebutt, growth |
| `sidecar/agents/masters/bill-ackman.ts` | Create | Ackman agent: activist investing |
| `sidecar/agents/masters/mohnish-pabrai.ts` | Create | Pabrai agent: Dhandho investing |
| `sidecar/agents/masters/nassim-taleb.ts` | Create | Taleb agent: antifragility, tail risk |
| `sidecar/agents/masters/stanley-druckenmiller.ts` | Create | Druckenmiller agent: macro + growth |
| `sidecar/agents/masters/aswath-damodaran.ts` | Create | Damodaran agent: valuation + story |
| `sidecar/agents/masters/rakesh-jhunjhunwala.ts` | Create | Jhunjhunwala agent: long-term wealth |
| `sidecar/agents/ATTRIBUTION.md` | Create | MIT license attribution for ai-hedge-fund |
| `sidecar/deep-analysis.ts` | Create | Orchestrator: runs agents in parallel, calls synthesizer |
| `sidecar/configResolver.ts` | Modify | Add `masterAnalysis` and `selectedMasters` fields to ResolvedConfig |
| `sidecar/cli-handlers.ts` | Modify | Add `handleDeepAnalysis` handler |
| `sidecar/index.ts` | Modify | Add `--deep-analysis` to COMMAND_TABLE |
| `shared/types.ts` | Modify | Add DeepAnalysisResult, DeepAnalysisResponse, MasterSignal, SentimentSignal types |
| `shared/constants.ts` | Modify | Add DEFAULT_SELECTED_MASTERS, bump CONFIG_VERSION |
| `src/lib/ipc.ts` | Modify | Add `deepAnalyze()` IPC function |
| `src/lib/dev-mocks.ts` | Modify | Add MOCK_DEEP_ANALYSIS |
| `src/hooks/useDeepAnalysis.ts` | Create | Hook managing deep analysis state |
| `src/components/DeepAnalysis/DeepAnalysisPanel.tsx` | Create | Container for deep analysis results |
| `src/components/DeepAnalysis/MasterCard.tsx` | Create | Individual master signal card |
| `src/components/DeepAnalysis/SynthesisSummary.tsx` | Create | Consensus + synthesis header |
| `src/components/DeepAnalysis/SentimentBreakdown.tsx` | Create | News sentiment bar |
| `src/components/AnalysisPanel.tsx` | Modify | Integrate DeepAnalysisPanel |
| `src/components/settings/DeepAnalysisSettings.tsx` | Create | Master selection UI |
| `src/components/SettingsModal.tsx` | Modify | Add deep analysis settings section |
| `src-tauri/src/lib.rs` | Modify | Add `deep_analyze` Tauri command |
| Tests (various) | Create | Unit tests for agents, registry, synthesizer, sentiment, orchestrator |

---

### Task 1: Core Types & Shared Constants

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/constants.ts`
- Create: `sidecar/agents/types.ts`

- [ ] **Step 1: Add shared types to `shared/types.ts`**

Append after the existing `QuantBundle` interface (line ~196):

```typescript
/** 投资大师元信息 */
export interface MasterMeta {
  id: string;
  name: string;
  nameZh: string;
  style: string;
  styleZh: string;
  avatar: string;
  description: string;
}

/** 单个大师的分析信号 */
export interface MasterSignal {
  masterId: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

/** 情绪分析信号 */
export interface SentimentSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  newsBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
}

/** 深度分析综合结果 */
export interface DeepAnalysisResult {
  masterSignals: MasterSignal[];
  sentiment: SentimentSignal;
  synthesis: {
    signal: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    summary: string;
    consensus: number;
  };
}

/** 深度分析完整响应（含新闻和量化数据） */
export interface DeepAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
  quant?: QuantBundle;
  deepAnalysis: DeepAnalysisResult;
}
```

- [ ] **Step 2: Add constants to `shared/constants.ts`**

Append after `CONFIG_VERSION`:

```typescript
/** 深度分析默认启用的大师 ID 列表 */
export const DEFAULT_SELECTED_MASTERS: string[] = [
  'warren-buffett',
  'ben-graham',
  'michael-burry',
  'cathie-wood',
  'aswath-damodaran',
];
```

- [ ] **Step 3: Create `sidecar/agents/types.ts`**

```typescript
import type { QuantBundle, StockNews, MasterMeta, MasterSignal, SentimentSignal, DeepAnalysisResult } from '../../shared/types';

export type { MasterMeta, MasterSignal, SentimentSignal, DeepAnalysisResult };

/** LLM 聊天接口——从现有 provider 中抽出的最小接口，供 agent 使用 */
export interface ChatProvider {
  chat(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** 传入每个大师的分析上下文 */
export interface MasterAnalysisContext {
  symbol: string;
  quant: QuantBundle;
  news: StockNews[];
  chat: ChatProvider;
}

/** 大师 Agent 接口 */
export interface MasterAgent {
  meta: MasterMeta;
  analyze(ctx: MasterAnalysisContext): Promise<MasterSignal>;
}
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/constants.ts sidecar/agents/types.ts
git commit -m "feat(agents): add core types for multi-agent master analysis"
```

---

### Task 2: ChatProvider Adapter

**Files:**
- Create: `sidecar/agents/chat-adapter.ts`
- Test: `sidecar/agents/chat-adapter.test.ts`

The existing `AIProvider` interface only has `analyze()`. Masters need a generic `chat()` method. We create a thin adapter that wraps the OpenAI SDK client (already available via provider config).

- [ ] **Step 1: Write the failing test**

Create `sidecar/agents/chat-adapter.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { createChatProvider } from './chat-adapter';

describe('createChatProvider', () => {
  test('returns a ChatProvider with chat method', () => {
    const provider = createChatProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o',
    });
    expect(provider).toHaveProperty('chat');
    expect(typeof provider.chat).toBe('function');
  });

  test('chat sends system and user messages and returns content', async () => {
    const calls: unknown[] = [];
    const provider = createChatProvider(
      { provider: 'openai', apiKey: 'k', baseUrl: 'http://x', modelName: 'm' },
      {
        createCompletion: async (opts: unknown) => {
          calls.push(opts);
          return { choices: [{ message: { content: '{"signal":"bullish"}' } }] };
        },
      },
    );
    const result = await provider.chat('sys', 'usr');
    expect(result).toBe('{"signal":"bullish"}');
    expect(calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test chat-adapter.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `sidecar/agents/chat-adapter.ts`**

```typescript
import OpenAI from 'openai';
import type { ChatProvider } from './types';
import { PROVIDER_PROFILES } from '../../shared/constants';
import type { ProviderType } from '../../shared/types';
import { parseJsonFromAi, toErrorMessage, logger } from '../utils';

interface ChatConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

interface CompletionDep {
  createCompletion: (opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string };
  }) => Promise<{ choices: Array<{ message: { content: string } }> }>;
}

export function createChatProvider(config: ChatConfig, dep?: CompletionDep): ChatProvider {
  const client = dep ?? createOpenAIClient(config);

  return {
    async chat(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await client.createCompletion({
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });
      return response.choices[0]?.message?.content || '{}';
    },
  };
}

function createOpenAIClient(config: ChatConfig): CompletionDep {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return {
    async createCompletion(opts) {
      const profile = PROVIDER_PROFILES[config.provider as ProviderType] ?? PROVIDER_PROFILES.openai;
      const response = await client.chat.completions.create(
        {
          model: opts.model,
          messages: opts.messages as OpenAI.ChatCompletionMessageParam[],
          response_format: opts.response_format as OpenAI.ChatCompletionCreateParams['response_format'],
        },
        { timeout: profile.timeout },
      );
      if (!response.choices?.length) throw new Error('LLM 返回空 choices');
      return { choices: [{ message: { content: response.choices[0].message.content || '{}' } }] };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test chat-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/agents/chat-adapter.ts sidecar/agents/chat-adapter.test.ts
git commit -m "feat(agents): add ChatProvider adapter for master agent LLM calls"
```

---

### Task 3: Master Agent Template — Warren Buffett

**Files:**
- Create: `sidecar/agents/masters/warren-buffett.ts`
- Test: `sidecar/agents/masters/warren-buffett.test.ts`

This establishes the pattern all other masters will follow.

- [ ] **Step 1: Write the failing test**

Create `sidecar/agents/masters/warren-buffett.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { agent } from './warren-buffett';
import type { MasterAnalysisContext } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: { signal: 'bullish', confidence: 75, details: { rsi: 55, adx: 30, alignment: 'bullish' } },
  fundamental: { signal: 'bullish', confidence: 65, details: { roe: 25, net_margin: 20, pe: 28, pb: 12, debt_to_asset: 30 } },
  composite: { signal: 'bullish', score: 72 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  { title: 'Apple reports record revenue', source: 'Reuters', date: '2026-05-20', content: 'Strong earnings beat', url: '' },
];

function createMockChat(response: string) {
  return { chat: async () => response };
}

describe('warren-buffett agent', () => {
  test('meta has correct id and fields', () => {
    expect(agent.meta.id).toBe('warren-buffett');
    expect(agent.meta.nameZh).toBeTruthy();
    expect(agent.meta.styleZh).toBeTruthy();
  });

  test('analyze returns valid MasterSignal on success', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: createMockChat(JSON.stringify({ signal: 'bullish', confidence: 85, reasoning: '护城河深厚' })),
    };
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('warren-buffett');
    expect(result.signal).toBe('bullish');
    expect(result.confidence).toBe(85);
    expect(result.reasoning).toBe('护城河深厚');
  });

  test('analyze returns neutral on LLM failure', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: { chat: async () => { throw new Error('timeout'); } },
    };
    const result = await agent.analyze(ctx);
    expect(result.masterId).toBe('warren-buffett');
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
  });

  test('analyze returns neutral on invalid JSON', async () => {
    const ctx: MasterAnalysisContext = {
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: createMockChat('not json'),
    };
    const result = await agent.analyze(ctx);
    expect(result.signal).toBe('neutral');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test masters/warren-buffett.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create directory and implement**

Run: `mkdir -p /Users/hyh/code/StockAI/sidecar/agents/masters`

Create `sidecar/agents/masters/warren-buffett.ts`:

```typescript
import type { MasterAgent, MasterAnalysisContext, MasterSignal, MasterMeta } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

const meta: MasterMeta = {
  id: 'warren-buffett',
  name: 'Warren Buffett',
  nameZh: '沃伦·巴菲特',
  style: 'Value Investing',
  styleZh: '价值投资',
  avatar: 'buffett.png',
  description: '奥马哈先知，寻找具有持久竞争优势的优质企业，以合理价格长期持有',
};

// prompt 设计参考 ai-hedge-fund (MIT License, Copyright (c) virattt)
const SYSTEM_PROMPT = `你是沃伦·巴菲特。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 能力圈：这家公司的业务是否简单易懂？
- 竞争护城河：是否有持久的竞争优势（品牌、规模、转换成本、网络效应）？
- 管理层质量：ROE 是否持续高位？资本配置是否理性？
- 财务实力：负债率是否保守？净利率是否优秀？
- 估值与安全边际：PE/PB 是否合理？是否存在被低估的可能？
- 长期前景：基于新闻和基本面，10 年后这家公司会更强还是更弱？

信号规则：
- bullish：优质企业且估值合理或偏低（ROE>15%, 负债率<60%, PE合理）
- bearish：业务质量差或明显高估（ROE<8%, 或 PE>40 且无高增长支撑）
- neutral：好企业但估值偏高，或数据不足以做判断

置信度：
- 90-100%：能力圈内的优质企业，财务数据优秀，估值有吸引力
- 70-89%：护城河不错，估值合理
- 50-69%：信号混合，需更多信息
- 30-49%：超出能力圈或基本面令人担忧
- 10-29%：业务差或严重高估

用中文回复。推理控制在 200 字以内。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "reasoning": "..."}`;

function buildUserPrompt(ctx: MasterAnalysisContext): string {
  const { quant, news, symbol } = ctx;
  const fd = quant.fundamental.details;
  const td = quant.technical.details;

  const facts = [
    `股票: ${symbol}`,
    `综合量化评分: ${quant.composite.score}/100`,
    '',
    '[基本面数据]',
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    '',
    `[近期新闻 (${news.length} 条)]`,
    ...news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`),
  ].filter(Boolean).join('\n');

  return facts;
}

function parseResponse(raw: string, masterId: string): MasterSignal {
  try {
    const parsed = JSON.parse(raw);
    const signal = ['bullish', 'bearish', 'neutral'].includes(parsed.signal) ? parsed.signal : 'neutral';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    const reasoning = String(parsed.reasoning || '').slice(0, 500);
    return { masterId, signal, confidence, reasoning };
  } catch {
    return { masterId, signal: 'neutral', confidence: 50, reasoning: '响应解析失败' };
  }
}

async function analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
  const userPrompt = buildUserPrompt(ctx);
  try {
    const raw = await ctx.chat.chat(SYSTEM_PROMPT, userPrompt);
    return parseResponse(raw, meta.id);
  } catch (err) {
    logger.warn(`[${meta.id}] 分析失败: ${toErrorMessage(err)}`);
    return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: '分析服务暂不可用' };
  }
}

export const agent: MasterAgent = { meta, analyze };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test masters/warren-buffett.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/agents/masters/warren-buffett.ts sidecar/agents/masters/warren-buffett.test.ts
git commit -m "feat(agents): implement Warren Buffett master agent"
```

---

### Task 4: Remaining 12 Master Agents

**Files:**
- Create: `sidecar/agents/masters/ben-graham.ts`
- Create: `sidecar/agents/masters/charlie-munger.ts`
- Create: `sidecar/agents/masters/michael-burry.ts`
- Create: `sidecar/agents/masters/cathie-wood.ts`
- Create: `sidecar/agents/masters/peter-lynch.ts`
- Create: `sidecar/agents/masters/phil-fisher.ts`
- Create: `sidecar/agents/masters/bill-ackman.ts`
- Create: `sidecar/agents/masters/mohnish-pabrai.ts`
- Create: `sidecar/agents/masters/nassim-taleb.ts`
- Create: `sidecar/agents/masters/stanley-druckenmiller.ts`
- Create: `sidecar/agents/masters/aswath-damodaran.ts`
- Create: `sidecar/agents/masters/rakesh-jhunjhunwala.ts`
- Test: `sidecar/agents/masters/masters-common.test.ts`

Each follows the exact same structure as Warren Buffett (Task 3). The only differences are: `meta` fields, `SYSTEM_PROMPT` content (investment philosophy), and `buildUserPrompt` (which data to emphasize).

- [ ] **Step 1: Write a shared test for all masters**

Create `sidecar/agents/masters/masters-common.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import type { MasterAgent, MasterAnalysisContext } from '../types';
import type { QuantBundle, StockNews } from '../../../shared/types';

const ALL_MASTER_FILES = [
  'warren-buffett', 'ben-graham', 'charlie-munger', 'michael-burry',
  'cathie-wood', 'peter-lynch', 'phil-fisher', 'bill-ackman',
  'mohnish-pabrai', 'nassim-taleb', 'stanley-druckenmiller',
  'aswath-damodaran', 'rakesh-jhunjhunwala',
];

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: { signal: 'bullish', confidence: 70, details: { rsi: 55, adx: 28, alignment: 'bullish', macd_trend: 'expanding', volume_ratio: 1.2 } },
  fundamental: { signal: 'neutral', confidence: 55, details: { roe: 18, net_margin: 15, pe: 30, pb: 8, debt_to_asset: 45, revenue_growth: 8 } },
  composite: { signal: 'bullish', score: 64 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  { title: 'Company reports earnings', source: 'Reuters', date: '2026-05-20', content: 'Beat expectations', url: '' },
];

describe('all master agents share contract', () => {
  for (const file of ALL_MASTER_FILES) {
    describe(file, () => {
      let agent: MasterAgent;

      test('module exports agent with correct id', async () => {
        const mod = await import(`./${file}`);
        agent = mod.agent;
        expect(agent.meta.id).toBe(file);
        expect(agent.meta.name).toBeTruthy();
        expect(agent.meta.nameZh).toBeTruthy();
        expect(agent.meta.style).toBeTruthy();
        expect(agent.meta.styleZh).toBeTruthy();
        expect(agent.meta.description).toBeTruthy();
      });

      test('analyze returns valid signal on success', async () => {
        const mod = await import(`./${file}`);
        agent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: { chat: async () => JSON.stringify({ signal: 'bullish', confidence: 75, reasoning: '测试理由' }) },
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
        agent = mod.agent;
        const ctx: MasterAnalysisContext = {
          symbol: 'AAPL',
          quant: mockQuant,
          news: mockNews,
          chat: { chat: async () => { throw new Error('fail'); } },
        };
        const result = await agent.analyze(ctx);
        expect(result.signal).toBe('neutral');
        expect(result.confidence).toBe(50);
      });
    });
  }
});
```

- [ ] **Step 2: Implement all 12 remaining master agents**

Each file follows the warren-buffett.ts pattern exactly. Key differences per master:

| Master | SYSTEM_PROMPT Focus | buildUserPrompt Emphasis |
|--------|-------------------|------------------------|
| ben-graham | Margin of safety, PE<15, PB<1.5, earnings stability, net-net | PE, PB, debt, earnings growth |
| charlie-munger | Quality businesses, mental models, consistent ROE, fair price | ROE, margins, PE |
| michael-burry | Contrarian, technical oversold, hidden value, short overvalued | RSI oversold, PE/PB low, bearish technicals with strong fundamentals |
| cathie-wood | Disruption, innovation, high growth trajectory | Revenue growth, news innovation keywords |
| peter-lynch | PEG ratio (PE/growth), everyday businesses, ten-baggers | PE, growth rate, PEG calculation |
| phil-fisher | Scuttlebutt, long-term growth consistency, margin expansion | Revenue growth, margin trends, news quality |
| bill-ackman | Activist, bold contrarian, value unlock | Low PE with catalysts in news |
| mohnish-pabrai | Dhandho (low risk, high reward), heads I win tails I don't lose much | Downside protection (low debt), upside (growth + low PE) |
| nassim-taleb | Antifragility, tail risk, volatility analysis, asymmetric payoffs | ADX, volume ratio, RSI extremes, volatility |
| stanley-druckenmiller | Macro trends, asymmetric growth opportunities | Momentum (MACD), growth, news macro signals |
| aswath-damodaran | Story + numbers, valuation discipline, growth vs value | All fundamental metrics, composite score |
| rakesh-jhunjhunwala | Long-term wealth, India bull parallels, business durability | ROE, growth, margins, long-term signals |

Each file is ~100 lines following the exact same code structure as Task 3's warren-buffett.ts.

- [ ] **Step 3: Run the shared test**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test masters/masters-common.test.ts`
Expected: PASS (all 13 masters × 3 tests = 39 tests pass)

- [ ] **Step 4: Commit**

```bash
git add sidecar/agents/masters/
git commit -m "feat(agents): implement all 13 master investor agents

Adapted from ai-hedge-fund (MIT License, Copyright (c) virattt).
Each agent has unique investment philosophy prompt and data emphasis."
```

---

### Task 5: Master Registry

**Files:**
- Create: `sidecar/agents/registry.ts`
- Test: `sidecar/agents/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/agents/registry.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { getMaster, getAllMasters, getSelectedMasters, DEFAULT_MASTER_IDS } from './registry';

describe('master registry', () => {
  test('getAllMasters returns 13 agents', () => {
    const all = getAllMasters();
    expect(all).toHaveLength(13);
  });

  test('getMaster returns agent by id', () => {
    const buffett = getMaster('warren-buffett');
    expect(buffett).toBeTruthy();
    expect(buffett!.meta.id).toBe('warren-buffett');
  });

  test('getMaster returns undefined for unknown id', () => {
    expect(getMaster('unknown-person')).toBeUndefined();
  });

  test('getSelectedMasters filters by id list', () => {
    const selected = getSelectedMasters(['warren-buffett', 'ben-graham']);
    expect(selected).toHaveLength(2);
    expect(selected[0].meta.id).toBe('warren-buffett');
    expect(selected[1].meta.id).toBe('ben-graham');
  });

  test('getSelectedMasters ignores invalid ids', () => {
    const selected = getSelectedMasters(['warren-buffett', 'invalid']);
    expect(selected).toHaveLength(1);
  });

  test('DEFAULT_MASTER_IDS has 5 entries', () => {
    expect(DEFAULT_MASTER_IDS).toHaveLength(5);
  });

  test('all default masters exist in registry', () => {
    for (const id of DEFAULT_MASTER_IDS) {
      expect(getMaster(id)).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `sidecar/agents/registry.ts`**

```typescript
import type { MasterAgent } from './types';
import { DEFAULT_SELECTED_MASTERS } from '../../shared/constants';
import { agent as warrenBuffett } from './masters/warren-buffett';
import { agent as benGraham } from './masters/ben-graham';
import { agent as charlieMunger } from './masters/charlie-munger';
import { agent as michaelBurry } from './masters/michael-burry';
import { agent as cathieWood } from './masters/cathie-wood';
import { agent as peterLynch } from './masters/peter-lynch';
import { agent as philFisher } from './masters/phil-fisher';
import { agent as billAckman } from './masters/bill-ackman';
import { agent as mohnishPabrai } from './masters/mohnish-pabrai';
import { agent as nassimTaleb } from './masters/nassim-taleb';
import { agent as stanleyDruckenmiller } from './masters/stanley-druckenmiller';
import { agent as aswathDamodaran } from './masters/aswath-damodaran';
import { agent as rakeshJhunjhunwala } from './masters/rakesh-jhunjhunwala';

const REGISTRY: Map<string, MasterAgent> = new Map([
  [warrenBuffett.meta.id, warrenBuffett],
  [benGraham.meta.id, benGraham],
  [charlieMunger.meta.id, charlieMunger],
  [michaelBurry.meta.id, michaelBurry],
  [cathieWood.meta.id, cathieWood],
  [peterLynch.meta.id, peterLynch],
  [philFisher.meta.id, philFisher],
  [billAckman.meta.id, billAckman],
  [mohnishPabrai.meta.id, mohnishPabrai],
  [nassimTaleb.meta.id, nassimTaleb],
  [stanleyDruckenmiller.meta.id, stanleyDruckenmiller],
  [aswathDamodaran.meta.id, aswathDamodaran],
  [rakeshJhunjhunwala.meta.id, rakeshJhunjhunwala],
]);

export const DEFAULT_MASTER_IDS = DEFAULT_SELECTED_MASTERS;

export function getMaster(id: string): MasterAgent | undefined {
  return REGISTRY.get(id);
}

export function getAllMasters(): MasterAgent[] {
  return [...REGISTRY.values()];
}

export function getSelectedMasters(ids: string[]): MasterAgent[] {
  return ids.map(id => REGISTRY.get(id)).filter((a): a is MasterAgent => a != null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/agents/registry.ts sidecar/agents/registry.test.ts
git commit -m "feat(agents): add master registry with lookup and selection"
```

---

### Task 6: Sentiment Agent

**Files:**
- Create: `sidecar/agents/sentiment.ts`
- Test: `sidecar/agents/sentiment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/agents/sentiment.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { analyzeSentiment, computeSentimentSignal } from './sentiment';
import type { StockNews } from '../../shared/types';
import type { ChatProvider } from './types';

const mockNews: StockNews[] = [
  { title: 'Revenue beats expectations', source: 'Reuters', date: '2026-05-20', content: 'Strong growth', url: '' },
  { title: 'CEO under investigation', source: 'WSJ', date: '2026-05-19', content: 'Legal trouble', url: '' },
  { title: 'Market update', source: 'Bloomberg', date: '2026-05-18', content: 'Normal trading', url: '' },
];

describe('computeSentimentSignal', () => {
  test('computes correct breakdown and signal', () => {
    const items = [
      { index: 1, sentiment: 'positive' as const },
      { index: 2, sentiment: 'negative' as const },
      { index: 3, sentiment: 'neutral' as const },
    ];
    const result = computeSentimentSignal(items);
    expect(result.newsBreakdown.positive).toBe(1);
    expect(result.newsBreakdown.negative).toBe(1);
    expect(result.newsBreakdown.neutral).toBe(1);
    expect(result.newsBreakdown.total).toBe(3);
    expect(result.signal).toBe('neutral');
  });

  test('majority positive → bullish', () => {
    const items = [
      { index: 1, sentiment: 'positive' as const },
      { index: 2, sentiment: 'positive' as const },
      { index: 3, sentiment: 'neutral' as const },
    ];
    const result = computeSentimentSignal(items);
    expect(result.signal).toBe('bullish');
  });

  test('majority negative → bearish', () => {
    const items = [
      { index: 1, sentiment: 'negative' as const },
      { index: 2, sentiment: 'negative' as const },
      { index: 3, sentiment: 'positive' as const },
    ];
    const result = computeSentimentSignal(items);
    expect(result.signal).toBe('bearish');
  });
});

describe('analyzeSentiment', () => {
  test('calls LLM and parses response', async () => {
    const mockChat: ChatProvider = {
      chat: async () => JSON.stringify({
        items: [
          { index: 1, sentiment: 'positive' },
          { index: 2, sentiment: 'negative' },
          { index: 3, sentiment: 'neutral' },
        ],
        overall: 'neutral',
      }),
    };
    const result = await analyzeSentiment(mockNews, mockChat);
    expect(result.newsBreakdown.total).toBe(3);
    expect(result.signal).toBe('neutral');
  });

  test('returns neutral on LLM failure', async () => {
    const failChat: ChatProvider = {
      chat: async () => { throw new Error('timeout'); },
    };
    const result = await analyzeSentiment(mockNews, failChat);
    expect(result.signal).toBe('neutral');
    expect(result.confidence).toBe(50);
    expect(result.newsBreakdown.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/sentiment.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `sidecar/agents/sentiment.ts`**

```typescript
import type { SentimentSignal } from '../../shared/types';
import type { ChatProvider } from './types';
import type { StockNews } from '../../shared/types';
import { logger, toErrorMessage } from '../utils';

const SYSTEM_PROMPT = `你是金融新闻情绪分析专家。对每条新闻标注情绪倾向并给出整体判断。只返回 JSON。`;

interface SentimentItem {
  index: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}

function buildPrompt(news: StockNews[]): string {
  const items = news.map((n, i) =>
    `${i + 1}. ${n.title}${n.content ? '\n   ' + n.content.substring(0, 300) : ''}`,
  ).join('\n\n');

  return `对以下 ${news.length} 条新闻逐条标注情绪（positive/negative/neutral）：

${items}

返回格式：
{
  "items": [{"index": 1, "sentiment": "positive"}, ...],
  "overall": "positive" | "negative" | "neutral"
}`;
}

export function computeSentimentSignal(items: SentimentItem[]): SentimentSignal {
  const breakdown = { positive: 0, negative: 0, neutral: 0, total: items.length };
  for (const item of items) {
    if (item.sentiment === 'positive') breakdown.positive++;
    else if (item.sentiment === 'negative') breakdown.negative++;
    else breakdown.neutral++;
  }

  let signal: 'bullish' | 'bearish' | 'neutral';
  if (breakdown.positive > breakdown.negative && breakdown.positive > breakdown.neutral) {
    signal = 'bullish';
  } else if (breakdown.negative > breakdown.positive && breakdown.negative > breakdown.neutral) {
    signal = 'bearish';
  } else {
    signal = 'neutral';
  }

  const maxCount = Math.max(breakdown.positive, breakdown.negative, breakdown.neutral);
  const confidence = breakdown.total > 0 ? Math.round((maxCount / breakdown.total) * 100) : 50;

  return { signal, confidence, newsBreakdown: breakdown };
}

export async function analyzeSentiment(news: StockNews[], chat: ChatProvider): Promise<SentimentSignal> {
  if (news.length === 0) {
    return { signal: 'neutral', confidence: 50, newsBreakdown: { positive: 0, negative: 0, neutral: 0, total: 0 } };
  }

  try {
    const prompt = buildPrompt(news);
    const raw = await chat.chat(SYSTEM_PROMPT, prompt);
    const parsed = JSON.parse(raw) as { items?: SentimentItem[]; overall?: string };
    const items: SentimentItem[] = (parsed.items || []).map(it => ({
      index: it.index,
      sentiment: ['positive', 'negative', 'neutral'].includes(it.sentiment) ? it.sentiment : 'neutral',
    }));
    return computeSentimentSignal(items);
  } catch (err) {
    logger.warn(`情绪分析失败: ${toErrorMessage(err)}`);
    return { signal: 'neutral', confidence: 50, newsBreakdown: { positive: 0, negative: 0, neutral: 0, total: 0 } };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/sentiment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/agents/sentiment.ts sidecar/agents/sentiment.test.ts
git commit -m "feat(agents): add sentiment agent with LLM-based news classification"
```

---

### Task 7: Synthesizer

**Files:**
- Create: `sidecar/agents/synthesizer.ts`
- Test: `sidecar/agents/synthesizer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/agents/synthesizer.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { computeConsensus, synthesize } from './synthesizer';
import type { MasterSignal, SentimentSignal, QuantBundle } from '../../shared/types';
import type { ChatProvider } from './types';

const bullishSignal = (id: string, conf = 80): MasterSignal => ({
  masterId: id, signal: 'bullish', confidence: conf, reasoning: '看好',
});
const bearishSignal = (id: string, conf = 70): MasterSignal => ({
  masterId: id, signal: 'bearish', confidence: conf, reasoning: '看衰',
});

describe('computeConsensus', () => {
  test('all bullish → 100 consensus', () => {
    const signals = [bullishSignal('a'), bullishSignal('b'), bullishSignal('c')];
    expect(computeConsensus(signals)).toBe(100);
  });

  test('mixed signals → lower consensus', () => {
    const signals = [bullishSignal('a'), bearishSignal('b'), bullishSignal('c')];
    const consensus = computeConsensus(signals);
    expect(consensus).toBeGreaterThan(50);
    expect(consensus).toBeLessThan(100);
  });

  test('empty array → 0', () => {
    expect(computeConsensus([])).toBe(0);
  });
});

describe('synthesize', () => {
  const mockQuant: QuantBundle = {
    symbol: 'AAPL',
    technical: { signal: 'bullish', confidence: 70, details: {} },
    fundamental: { signal: 'neutral', confidence: 55, details: {} },
    composite: { signal: 'bullish', score: 65 },
    fetchedAt: Date.now(),
  };

  const mockSentiment: SentimentSignal = {
    signal: 'bullish', confidence: 70,
    newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
  };

  test('synthesize calls LLM and returns DeepAnalysisResult', async () => {
    const masters = [bullishSignal('warren-buffett'), bullishSignal('ben-graham')];
    const chat: ChatProvider = {
      chat: async () => JSON.stringify({
        signal: 'bullish', confidence: 82,
        summary: '综合看好', consensus: 95,
      }),
    };
    const result = await synthesize(masters, mockSentiment, mockQuant, chat);
    expect(result.masterSignals).toEqual(masters);
    expect(result.sentiment).toEqual(mockSentiment);
    expect(result.synthesis.signal).toBe('bullish');
    expect(result.synthesis.summary).toBe('综合看好');
  });

  test('synthesize falls back to local computation on LLM failure', async () => {
    const masters = [bullishSignal('a', 90), bearishSignal('b', 60), bullishSignal('c', 80)];
    const failChat: ChatProvider = { chat: async () => { throw new Error('fail'); } };
    const result = await synthesize(masters, mockSentiment, mockQuant, failChat);
    expect(result.synthesis.signal).toBe('bullish');
    expect(result.synthesis.consensus).toBeGreaterThan(50);
    expect(result.synthesis.summary).toContain('大师');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/synthesizer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `sidecar/agents/synthesizer.ts`**

```typescript
import type { MasterSignal, SentimentSignal, DeepAnalysisResult, QuantBundle } from '../../shared/types';
import type { ChatProvider } from './types';
import { logger, toErrorMessage } from '../utils';

const SYSTEM_PROMPT = `你是投资委员会主席。综合所有分析师的独立研判，给出最终投资建议。
重点关注：多数分析师的共识方向、高置信度分析师的权重更大、不同风格间的分歧。
用中文回复。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内综合分析", "consensus": 0-100}`;

export function computeConsensus(signals: MasterSignal[]): number {
  if (signals.length === 0) return 0;
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) counts[s.signal]++;
  const maxCount = Math.max(counts.bullish, counts.bearish, counts.neutral);
  return Math.round((maxCount / signals.length) * 100);
}

function computeLocalSynthesis(signals: MasterSignal[]): { signal: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
  if (signals.length === 0) return { signal: 'neutral', confidence: 50 };

  let bullishWeight = 0;
  let bearishWeight = 0;
  let neutralWeight = 0;

  for (const s of signals) {
    const w = s.confidence;
    if (s.signal === 'bullish') bullishWeight += w;
    else if (s.signal === 'bearish') bearishWeight += w;
    else neutralWeight += w;
  }

  const total = bullishWeight + bearishWeight + neutralWeight;
  if (total === 0) return { signal: 'neutral', confidence: 50 };

  const maxWeight = Math.max(bullishWeight, bearishWeight, neutralWeight);
  const signal = maxWeight === bullishWeight ? 'bullish' : maxWeight === bearishWeight ? 'bearish' : 'neutral';
  const confidence = Math.round((maxWeight / total) * 100);

  return { signal, confidence };
}

function buildSynthesisPrompt(signals: MasterSignal[], sentiment: SentimentSignal, quant: QuantBundle): string {
  const signalSummary = signals.map(s =>
    `- ${s.masterId}: ${s.signal} (${s.confidence}%) — ${s.reasoning.slice(0, 80)}`,
  ).join('\n');

  return `[各大师研判]
${signalSummary}

[情绪分析]
信号: ${sentiment.signal}, 正面新闻 ${sentiment.newsBreakdown.positive}/${sentiment.newsBreakdown.total}

[量化评分]
综合: ${quant.composite.score}/100 (${quant.composite.signal})
技术面: ${quant.technical.signal} (${quant.technical.confidence}%)
基本面: ${quant.fundamental.signal} (${quant.fundamental.confidence}%)`;
}

export async function synthesize(
  masterSignals: MasterSignal[],
  sentiment: SentimentSignal,
  quant: QuantBundle,
  chat: ChatProvider,
): Promise<DeepAnalysisResult> {
  const consensus = computeConsensus(masterSignals);
  const localSynthesis = computeLocalSynthesis(masterSignals);

  let synthesis: DeepAnalysisResult['synthesis'];
  try {
    const prompt = buildSynthesisPrompt(masterSignals, sentiment, quant);
    const raw = await chat.chat(SYSTEM_PROMPT, prompt);
    const parsed = JSON.parse(raw);
    synthesis = {
      signal: ['bullish', 'bearish', 'neutral'].includes(parsed.signal) ? parsed.signal : localSynthesis.signal,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || localSynthesis.confidence)),
      summary: String(parsed.summary || '').slice(0, 1000),
      consensus: Number(parsed.consensus) || consensus,
    };
  } catch (err) {
    logger.warn(`综合研判 LLM 失败，使用本地计算: ${toErrorMessage(err)}`);
    const bullishCount = masterSignals.filter(s => s.signal === 'bullish').length;
    const bearishCount = masterSignals.filter(s => s.signal === 'bearish').length;
    synthesis = {
      signal: localSynthesis.signal,
      confidence: localSynthesis.confidence,
      summary: `${masterSignals.length} 位大师中 ${bullishCount} 位看涨、${bearishCount} 位看跌。综合判断为${localSynthesis.signal === 'bullish' ? '看涨' : localSynthesis.signal === 'bearish' ? '看跌' : '中性'}。`,
      consensus,
    };
  }

  return { masterSignals, sentiment, synthesis };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test agents/synthesizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/agents/synthesizer.ts sidecar/agents/synthesizer.test.ts
git commit -m "feat(agents): add synthesizer for multi-agent signal aggregation"
```

---

### Task 8: Deep Analysis Orchestrator

**Files:**
- Create: `sidecar/deep-analysis.ts`
- Test: `sidecar/deep-analysis.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/deep-analysis.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { runDeepAnalysis } from './deep-analysis';
import type { QuantBundle, StockNews } from '../shared/types';
import type { ChatProvider } from './agents/types';

const mockQuant: QuantBundle = {
  symbol: 'AAPL',
  technical: { signal: 'bullish', confidence: 70, details: {} },
  fundamental: { signal: 'neutral', confidence: 55, details: { roe: 18, pe: 30 } },
  composite: { signal: 'bullish', score: 64 },
  fetchedAt: Date.now(),
};

const mockNews: StockNews[] = [
  { title: 'Good news', source: 'Reuters', date: '2026-05-20', content: '', url: '' },
];

const mockChat: ChatProvider = {
  chat: async () => JSON.stringify({ signal: 'bullish', confidence: 75, reasoning: '看好', items: [{ index: 1, sentiment: 'positive' }], overall: 'positive', summary: '综合看好', consensus: 85 }),
};

describe('runDeepAnalysis', () => {
  test('runs selected masters and returns DeepAnalysisResult', async () => {
    const result = await runDeepAnalysis({
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: mockChat,
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });

    expect(result.masterSignals).toHaveLength(2);
    expect(result.masterSignals[0].masterId).toBe('warren-buffett');
    expect(result.masterSignals[1].masterId).toBe('ben-graham');
    expect(result.sentiment).toHaveProperty('newsBreakdown');
    expect(result.synthesis).toHaveProperty('signal');
    expect(result.synthesis).toHaveProperty('consensus');
  });

  test('handles individual agent failures gracefully', async () => {
    let callCount = 0;
    const flakyChat: ChatProvider = {
      chat: async () => {
        callCount++;
        if (callCount === 1) throw new Error('first call fails');
        return JSON.stringify({ signal: 'bullish', confidence: 70, reasoning: '好', items: [{ index: 1, sentiment: 'positive' }], overall: 'positive', summary: '好', consensus: 80 });
      },
    };

    const result = await runDeepAnalysis({
      symbol: 'AAPL',
      quant: mockQuant,
      news: mockNews,
      chat: flakyChat,
      selectedMasters: ['warren-buffett', 'ben-graham'],
    });

    expect(result.masterSignals).toHaveLength(2);
    // First agent fails → neutral fallback
    const failedAgent = result.masterSignals.find(s => s.signal === 'neutral');
    expect(failedAgent).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test deep-analysis.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `sidecar/deep-analysis.ts`**

```typescript
import type { QuantBundle, StockNews, DeepAnalysisResult } from '../shared/types';
import type { ChatProvider, MasterAnalysisContext } from './agents/types';
import { getSelectedMasters, DEFAULT_MASTER_IDS } from './agents/registry';
import { analyzeSentiment } from './agents/sentiment';
import { synthesize } from './agents/synthesizer';
import { logger } from './utils';

export interface DeepAnalysisOptions {
  symbol: string;
  quant: QuantBundle;
  news: StockNews[];
  chat: ChatProvider;
  selectedMasters?: string[];
}

export async function runDeepAnalysis(opts: DeepAnalysisOptions): Promise<DeepAnalysisResult> {
  const { symbol, quant, news, chat, selectedMasters = DEFAULT_MASTER_IDS } = opts;

  const masters = getSelectedMasters(selectedMasters);
  if (masters.length === 0) {
    logger.warn('未找到有效的大师配置，使用默认列表');
    const fallback = getSelectedMasters(DEFAULT_MASTER_IDS);
    masters.push(...fallback);
  }

  const ctx: MasterAnalysisContext = { symbol, quant, news, chat };

  // 并行执行所有大师 + 情绪分析
  const [masterResults, sentimentResult] = await Promise.all([
    Promise.all(masters.map(m => m.analyze(ctx))),
    analyzeSentiment(news, chat),
  ]);

  // 综合研判
  const result = await synthesize(masterResults, sentimentResult, quant, chat);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/hyh/code/StockAI/sidecar && bun test deep-analysis.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sidecar/deep-analysis.ts sidecar/deep-analysis.test.ts
git commit -m "feat(agents): add deep analysis orchestrator"
```

---

### Task 9: Config & CLI Integration

**Files:**
- Modify: `sidecar/configResolver.ts`
- Modify: `sidecar/cli-handlers.ts`
- Modify: `sidecar/index.ts`
- Modify: `shared/constants.ts`

- [ ] **Step 1: Extend `ResolvedConfig` in `sidecar/configResolver.ts`**

Add `masterAnalysis` and `selectedMasters` to the interface and `resolveConfig()`:

```typescript
// In ResolvedConfig interface, add:
  masterAnalysis: boolean;
  selectedMasters: string[];

// In resolveConfig(), add before the return:
  const { DEFAULT_SELECTED_MASTERS } = await import('../shared/constants');
  // ... actually since this is sync, import at top:
```

Full modified `resolveConfig` function — add to the return object:

```typescript
    masterAnalysis: obj.masterAnalysis === true,
    selectedMasters: Array.isArray(obj.selectedMasters) ? obj.selectedMasters : DEFAULT_SELECTED_MASTERS,
```

- [ ] **Step 2: Bump CONFIG_VERSION in `shared/constants.ts`**

Change `export const CONFIG_VERSION = "2";` to `export const CONFIG_VERSION = "3";`

- [ ] **Step 3: Add `handleDeepAnalysis` to `sidecar/cli-handlers.ts`**

Add a new handler method inside `createHandlers()`:

```typescript
    async handleDeepAnalysis(symbol: string, news: StockNews[], config: ResolvedConfig, quantJson?: string) {
      try {
        if (!Array.isArray(news) || news.length === 0) {
          out(errorEnvelope('ERR_MISSING_PARAM', '深度分析需要 news 数据'));
          return;
        }
        let quant: QuantBundle | undefined;
        if (quantJson) {
          try { quant = JSON.parse(quantJson); } catch { logger.warn('quantJson 解析失败'); }
        }
        if (!quant) {
          const { fetchQuantBundle } = await import('./quant');
          quant = await fetchQuantBundle(symbol);
        }
        const { createChatProvider } = await import('./agents/chat-adapter');
        const { runDeepAnalysis } = await import('./deep-analysis');
        const chat = createChatProvider({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          modelName: config.modelName,
        });
        const result = await runDeepAnalysis({
          symbol,
          quant,
          news,
          chat,
          selectedMasters: config.selectedMasters,
        });
        out(successEnvelope(result));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_DEEP_ANALYSIS', error));
      }
    },
```

- [ ] **Step 4: Add `--deep-analysis` to COMMAND_TABLE in `sidecar/index.ts`**

Add to the COMMAND_TABLE array:

```typescript
  {
    // --deep-analysis config_json symbol news_path [quant_json]
    flag: '--deep-analysis',
    extract: (args, idx) => ({
      configStr: args[idx + 1] || '{}',
      actionParam: args[idx + 2],
      newsJson: args[idx + 3],
      quantJson: args[idx + 4],
    }),
  },
```

Add a case in the switch statement:

```typescript
    case '--deep-analysis':
      try {
        const config = resolveConfig(rawConfig);
        if (!newsJson) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', '未提供 news 文件路径'));
          return;
        }
        let news: StockNews[] = [];
        try {
          news = JSON.parse(await Bun.file(newsJson).text());
        } catch (err) {
          outputJson(errorEnvelope('ERR_MISSING_PARAM', `读取 news 文件失败: ${toErrorMessage(err)}`));
          return;
        }
        await Handlers.handleDeepAnalysis(actionParam || '', news, config, quantJson);
      } catch (error) {
        outputJson(errorEnvelopeFromUnknown('ERR_CONFIG', error));
      }
      break;
```

- [ ] **Step 5: Run type check and existing tests**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit && cd sidecar && bun test configResolver.test.ts`
Expected: Type check passes. configResolver tests may need update for new CONFIG_VERSION — update the test fixture's `_version` from "2" to "3".

- [ ] **Step 6: Commit**

```bash
git add sidecar/configResolver.ts sidecar/cli-handlers.ts sidecar/index.ts shared/constants.ts
git commit -m "feat(agents): integrate deep analysis into sidecar CLI pipeline"
```

---

### Task 10: Rust Layer — New Tauri Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `deep_analyze` Tauri command**

Add a new `#[tauri::command]` that mirrors `analyze_news` but invokes `--deep-analysis`:

```rust
#[tauri::command]
async fn deep_analyze(
    app_handle: tauri::AppHandle,
    symbol: String,
    news: serde_json::Value,
    quant: Option<String>,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::deep_analyze(&app_handle, symbol, news, settings_val, quant).await
}
```

Register it in the `invoke_handler` list alongside existing commands.

- [ ] **Step 2: Add `deep_analyze` method to SidecarManager**

This mirrors the existing `analyze_news` method but uses `--deep-analysis` flag:

```rust
    async fn deep_analyze(
        app_handle: &tauri::AppHandle,
        symbol: String,
        news: serde_json::Value,
        settings: serde_json::Value,
        quant: Option<String>,
    ) -> Result<String, String> {
        // Write news to temp file (same pattern as analyze_news)
        let news_path = Self::write_temp_news(&news)?;

        let mut args = vec![
            "--deep-analysis".to_string(),
            settings.to_string(),
            symbol,
            news_path,
        ];
        if let Some(q) = quant {
            args.push(q);
        }

        Self::run_sidecar(app_handle, args).await
    }
```

- [ ] **Step 3: Run Rust tests**

Run: `cd /Users/hyh/code/StockAI/src-tauri && cargo test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): add deep_analyze command for multi-agent analysis"
```

---

### Task 11: Frontend IPC & Hook

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/dev-mocks.ts`
- Create: `src/hooks/useDeepAnalysis.ts`

- [ ] **Step 1: Add `deepAnalyze` to `src/lib/ipc.ts`**

After the existing `analyzeNews` function, add:

```typescript
import type { DeepAnalysisResult } from "../../shared/types";

export async function deepAnalyze(symbol: string, news: StockNews[], quant?: QuantBundle): Promise<DeepAnalysisResult> {
  const quantJson = quant ? JSON.stringify(quant) : undefined;
  if (!isTauri()) return devBridgeInvoke<DeepAnalysisResult>("deep_analyze", { symbol, news, quant: quantJson }, MOCK_DEEP_ANALYSIS);

  try {
    const raw = await invoke<string>("deep_analyze", { symbol, news, quant: quantJson });
    return parseServiceResponse<DeepAnalysisResult>(raw);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(typeof error === 'string' ? error : String(error));
  }
}
```

- [ ] **Step 2: Add mock to `src/lib/dev-mocks.ts`**

```typescript
import type { DeepAnalysisResult } from "../../shared/types";

export const MOCK_DEEP_ANALYSIS: DeepAnalysisResult = {
  masterSignals: [
    { masterId: 'warren-buffett', signal: 'bullish', confidence: 85, reasoning: '护城河深厚，ROE 持续优秀' },
    { masterId: 'ben-graham', signal: 'neutral', confidence: 60, reasoning: 'PE 偏高，安全边际不足' },
    { masterId: 'michael-burry', signal: 'bearish', confidence: 55, reasoning: '估值过高，存在回调风险' },
    { masterId: 'cathie-wood', signal: 'bullish', confidence: 90, reasoning: '创新驱动力强' },
    { masterId: 'aswath-damodaran', signal: 'bullish', confidence: 72, reasoning: '增长叙事支撑估值' },
  ],
  sentiment: {
    signal: 'bullish', confidence: 70,
    newsBreakdown: { positive: 5, negative: 1, neutral: 2, total: 8 },
  },
  synthesis: {
    signal: 'bullish', confidence: 78,
    summary: '多数投资大师看好该股的长期价值，核心优势在于竞争护城河和持续盈利能力。',
    consensus: 75,
  },
};
```

- [ ] **Step 3: Create `src/hooks/useDeepAnalysis.ts`**

```typescript
import { useCallback, useRef, useState } from "react";
import type { DeepAnalysisResult, StockNews, QuantBundle } from "../../shared/types";
import { deepAnalyze } from "../lib/ipc";

export interface UseDeepAnalysisResult {
  result: DeepAnalysisResult | null;
  analyzing: boolean;
  error: string | null;
  analyze: (news: StockNews[], quant?: QuantBundle) => Promise<void>;
}

export function useDeepAnalysis(symbol: string): UseDeepAnalysisResult {
  const [result, setResult] = useState<DeepAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<string>('');

  const analyze = useCallback(async (news: StockNews[], quant?: QuantBundle) => {
    if (!symbol || news.length === 0) {
      setError('尚未抓到新闻，无法进行深度分析。');
      return;
    }
    const id = symbol;
    abortRef.current = id;
    setAnalyzing(true);
    setError(null);

    try {
      const data = await deepAnalyze(symbol, news, quant);
      if (abortRef.current === id) {
        setResult(data);
      }
    } catch (err) {
      if (abortRef.current === id) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (abortRef.current === id) setAnalyzing(false);
    }
  }, [symbol]);

  return { result, analyzing, error, analyze };
}
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ipc.ts src/lib/dev-mocks.ts src/hooks/useDeepAnalysis.ts
git commit -m "feat(frontend): add deep analysis IPC and hook"
```

---

### Task 12: Frontend Components — DeepAnalysis UI

**Files:**
- Create: `src/components/DeepAnalysis/MasterCard.tsx`
- Create: `src/components/DeepAnalysis/SynthesisSummary.tsx`
- Create: `src/components/DeepAnalysis/SentimentBreakdown.tsx`
- Create: `src/components/DeepAnalysis/DeepAnalysisPanel.tsx`

- [ ] **Step 1: Create `src/components/DeepAnalysis/MasterCard.tsx`**

```typescript
import React from 'react';
import type { MasterSignal } from '../../../shared/types';
import { getAllMasterMeta } from './master-meta';

interface MasterCardProps {
  signal: MasterSignal;
}

function signalColor(signal: string): string {
  switch (signal) {
    case 'bullish': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'bearish': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    default: return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
}

function signalLabel(signal: string): string {
  switch (signal) {
    case 'bullish': return '看涨';
    case 'bearish': return '看跌';
    default: return '中性';
  }
}

const MasterCard: React.FC<MasterCardProps> = ({ signal }) => {
  const meta = getAllMasterMeta().find(m => m.id === signal.masterId);
  const name = meta?.nameZh ?? signal.masterId;
  const style = meta?.styleZh ?? '';

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{name}</span>
          {style && <span className="ml-2 text-[10px] text-gray-500">{style}</span>}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${signalColor(signal.signal)}`}>
          {signalLabel(signal.signal)} {signal.confidence}%
        </span>
      </div>
      <p className="text-xs text-gray-400 line-clamp-2">{signal.reasoning}</p>
    </div>
  );
};

export default MasterCard;
```

- [ ] **Step 2: Create `src/components/DeepAnalysis/master-meta.ts`**

Static metadata for frontend rendering (avoids importing sidecar code):

```typescript
import type { MasterMeta } from '../../../shared/types';

const MASTER_META: MasterMeta[] = [
  { id: 'warren-buffett', name: 'Warren Buffett', nameZh: '沃伦·巴菲特', style: 'Value Investing', styleZh: '价值投资', avatar: 'buffett.png', description: '奥马哈先知' },
  { id: 'ben-graham', name: 'Ben Graham', nameZh: '本杰明·格雷厄姆', style: 'Deep Value', styleZh: '深度价值', avatar: 'graham.png', description: '价值投资之父' },
  { id: 'charlie-munger', name: 'Charlie Munger', nameZh: '查理·芒格', style: 'Quality Investing', styleZh: '品质投资', avatar: 'munger.png', description: '多元思维模型' },
  { id: 'michael-burry', name: 'Michael Burry', nameZh: '迈克尔·伯里', style: 'Contrarian Value', styleZh: '逆向价值', avatar: 'burry.png', description: '大空头' },
  { id: 'cathie-wood', name: 'Cathie Wood', nameZh: '凯西·伍德', style: 'Disruptive Innovation', styleZh: '颠覆式创新', avatar: 'wood.png', description: 'ARK 创新女王' },
  { id: 'peter-lynch', name: 'Peter Lynch', nameZh: '彼得·林奇', style: 'Growth at Value', styleZh: '成长价值', avatar: 'lynch.png', description: '十倍股猎手' },
  { id: 'phil-fisher', name: 'Phil Fisher', nameZh: '菲利普·费雪', style: 'Growth Investing', styleZh: '成长投资', avatar: 'fisher.png', description: '闲聊法大师' },
  { id: 'bill-ackman', name: 'Bill Ackman', nameZh: '比尔·阿克曼', style: 'Activist Investing', styleZh: '激进投资', avatar: 'ackman.png', description: '激进价值' },
  { id: 'mohnish-pabrai', name: 'Mohnish Pabrai', nameZh: '莫尼什·帕布莱', style: 'Dhandho Investing', styleZh: '低风险高回报', avatar: 'pabrai.png', description: 'Dhandho 哲学' },
  { id: 'nassim-taleb', name: 'Nassim Taleb', nameZh: '纳西姆·塔勒布', style: 'Antifragility', styleZh: '反脆弱', avatar: 'taleb.png', description: '黑天鹅猎手' },
  { id: 'stanley-druckenmiller', name: 'Stanley Druckenmiller', nameZh: '斯坦利·德鲁肯米勒', style: 'Macro Growth', styleZh: '宏观成长', avatar: 'druckenmiller.png', description: '宏观大师' },
  { id: 'aswath-damodaran', name: 'Aswath Damodaran', nameZh: '阿斯瓦斯·达摩达兰', style: 'Valuation', styleZh: '估值', avatar: 'damodaran.png', description: '估值院长' },
  { id: 'rakesh-jhunjhunwala', name: 'Rakesh Jhunjhunwala', nameZh: '拉凯什·金君瓦拉', style: 'Long-term Wealth', styleZh: '长期财富', avatar: 'jhunjhunwala.png', description: '印度大牛' },
];

export function getAllMasterMeta(): MasterMeta[] {
  return MASTER_META;
}

export function getMasterMeta(id: string): MasterMeta | undefined {
  return MASTER_META.find(m => m.id === id);
}
```

- [ ] **Step 3: Create `src/components/DeepAnalysis/SynthesisSummary.tsx`**

```typescript
import React from 'react';
import type { DeepAnalysisResult } from '../../../shared/types';

interface SynthesisSummaryProps {
  synthesis: DeepAnalysisResult['synthesis'];
  totalMasters: number;
}

function signalBadge(signal: string): { label: string; className: string } {
  switch (signal) {
    case 'bullish': return { label: '看涨', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'bearish': return { label: '看跌', className: 'bg-rose-500/20 text-rose-400' };
    default: return { label: '中性', className: 'bg-amber-500/20 text-amber-400' };
  }
}

const SynthesisSummary: React.FC<SynthesisSummaryProps> = ({ synthesis, totalMasters }) => {
  const badge = signalBadge(synthesis.signal);

  return (
    <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">综合研判</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
          {badge.label} {synthesis.confidence}%
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>共识度 {synthesis.consensus}%</span>
        <span>{totalMasters} 位大师参与分析</span>
      </div>
      {synthesis.summary && (
        <p className="text-xs text-gray-300 leading-relaxed">{synthesis.summary}</p>
      )}
    </div>
  );
};

export default SynthesisSummary;
```

- [ ] **Step 4: Create `src/components/DeepAnalysis/SentimentBreakdown.tsx`**

```typescript
import React from 'react';
import type { SentimentSignal } from '../../../shared/types';

interface SentimentBreakdownProps {
  sentiment: SentimentSignal;
}

const SentimentBreakdown: React.FC<SentimentBreakdownProps> = ({ sentiment }) => {
  const { positive, negative, neutral, total } = sentiment.newsBreakdown;
  if (total === 0) return null;

  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">新闻情绪</span>
        <span className="text-gray-500">{total} 条新闻</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {positive > 0 && <div className="bg-emerald-500" style={{ width: `${pPct}%` }} />}
        {neutral > 0 && <div className="bg-gray-500" style={{ width: `${100 - pPct - nPct}%` }} />}
        {negative > 0 && <div className="bg-rose-500" style={{ width: `${nPct}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span className="text-emerald-400">正面 {positive}</span>
        <span>中性 {neutral}</span>
        <span className="text-rose-400">负面 {negative}</span>
      </div>
    </div>
  );
};

export default SentimentBreakdown;
```

- [ ] **Step 5: Create `src/components/DeepAnalysis/DeepAnalysisPanel.tsx`**

```typescript
import React from 'react';
import type { DeepAnalysisResult } from '../../../shared/types';
import MasterCard from './MasterCard';
import SynthesisSummary from './SynthesisSummary';
import SentimentBreakdown from './SentimentBreakdown';

interface DeepAnalysisPanelProps {
  result: DeepAnalysisResult;
}

const DeepAnalysisPanel: React.FC<DeepAnalysisPanelProps> = ({ result }) => {
  return (
    <div className="space-y-4">
      <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">深度大师分析</h2>

      <SynthesisSummary synthesis={result.synthesis} totalMasters={result.masterSignals.length} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {result.masterSignals.map(signal => (
          <MasterCard key={signal.masterId} signal={signal} />
        ))}
      </div>

      <SentimentBreakdown sentiment={result.sentiment} />
    </div>
  );
};

export default DeepAnalysisPanel;
```

- [ ] **Step 6: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/DeepAnalysis/
git commit -m "feat(ui): add deep analysis card-based UI components"
```

---

### Task 13: Integrate Deep Analysis into AnalysisPanel

**Files:**
- Modify: `src/components/AnalysisPanel.tsx`

- [ ] **Step 1: Import and render DeepAnalysisPanel**

Add import at top:

```typescript
import DeepAnalysisPanel from './DeepAnalysis/DeepAnalysisPanel';
import type { DeepAnalysisResult } from '../../shared/types';
```

Add `deepAnalysis` prop to `AnalysisPanelProps`:

```typescript
  deepAnalysis: DeepAnalysisResult | null;
  deepAnalyzing: boolean;
  deepError: string | null;
  onDeepAnalyze: () => void;
```

Add a "深度分析" button and result section after the existing AI analysis section:

```typescript
      {/* 深度大师分析 */}
      {record && !deepAnalysis && (
        <div className="mb-6">
          <button
            onClick={onDeepAnalyze}
            disabled={deepAnalyzing}
            className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 transition-colors"
          >
            {deepAnalyzing ? '深度分析中...' : '🎓 深度大师分析'}
          </button>
          {deepError && <p className="mt-2 text-xs text-rose-400">{deepError}</p>}
        </div>
      )}

      {deepAnalysis && <DeepAnalysisPanel result={deepAnalysis} />}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/AnalysisPanel.tsx
git commit -m "feat(ui): integrate deep analysis trigger and panel into AnalysisPanel"
```

---

### Task 14: Settings UI — Master Selection

**Files:**
- Create: `src/components/settings/DeepAnalysisSettings.tsx`
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Create `src/components/settings/DeepAnalysisSettings.tsx`**

```typescript
import React from 'react';
import { getAllMasterMeta } from '../DeepAnalysis/master-meta';

interface DeepAnalysisSettingsProps {
  masterAnalysis: boolean;
  selectedMasters: string[];
  onMasterAnalysisChange: (enabled: boolean) => void;
  onSelectedMastersChange: (ids: string[]) => void;
}

const DeepAnalysisSettings: React.FC<DeepAnalysisSettingsProps> = ({
  masterAnalysis, selectedMasters, onMasterAnalysisChange, onSelectedMastersChange,
}) => {
  const allMasters = getAllMasterMeta();

  function toggleMaster(id: string) {
    if (selectedMasters.includes(id)) {
      onSelectedMastersChange(selectedMasters.filter(m => m !== id));
    } else {
      onSelectedMastersChange([...selectedMasters, id]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300">启用深度大师分析</label>
        <input
          type="checkbox"
          checked={masterAnalysis}
          onChange={e => onMasterAnalysisChange(e.target.checked)}
          className="rounded"
        />
      </div>

      {masterAnalysis && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">选择参与分析的投资大师（每位消耗 1 次 LLM 调用）</p>
          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
            {allMasters.map(m => (
              <label key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMasters.includes(m.id)}
                  onChange={() => toggleMaster(m.id)}
                  className="rounded"
                />
                <span className="text-xs text-white">{m.nameZh}</span>
                <span className="text-[10px] text-gray-500">{m.styleZh}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">
            预计消耗: {selectedMasters.length + 2} 次 LLM 调用（{selectedMasters.length} 位大师 + 情绪 + 综合）
          </p>
        </div>
      )}
    </div>
  );
};

export default DeepAnalysisSettings;
```

- [ ] **Step 2: Integrate into SettingsModal**

Add a new section in the settings modal (after provider config) that renders `DeepAnalysisSettings`. Wire the `masterAnalysis` and `selectedMasters` state to the store persistence.

- [ ] **Step 3: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/DeepAnalysisSettings.tsx src/components/SettingsModal.tsx
git commit -m "feat(ui): add master selection settings for deep analysis"
```

---

### Task 15: Attribution & Full Test Run

**Files:**
- Create: `sidecar/agents/ATTRIBUTION.md`

- [ ] **Step 1: Create attribution file**

Create `sidecar/agents/ATTRIBUTION.md`:

```markdown
# Attribution

The investment philosophy prompts and analysis frameworks in this module are adapted
from the [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) project.

Copyright (c) virattt
Licensed under the MIT License

The original Python agent implementations have been translated to TypeScript,
adapted for the StockAI data model (QuantBundle + news), and localized to Chinese.
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/hyh/code/StockAI && bun run test`
Expected: All tests pass

- [ ] **Step 3: Run type check**

Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add sidecar/agents/ATTRIBUTION.md
git commit -m "docs: add MIT attribution for ai-hedge-fund prompt adaptations"
```

---

### Task 16: Manual Integration Test

- [ ] **Step 1: Start dev environment**

Run: `cd /Users/hyh/code/StockAI && bun tauri dev`

- [ ] **Step 2: Test fast mode (unchanged behavior)**

1. Search for a stock (e.g. "601012")
2. Click "AI 分析" button
3. Verify: existing analysis UI renders normally

- [ ] **Step 3: Enable deep analysis in settings**

1. Open Settings → find "深度大师分析" section
2. Toggle "启用深度大师分析" ON
3. Select 3-5 masters
4. Save settings

- [ ] **Step 4: Test deep analysis**

1. After fast analysis completes, click "🎓 深度大师分析"
2. Verify: loading state shows
3. Verify: master cards render with signals
4. Verify: synthesis summary shows consensus
5. Verify: sentiment bar shows news breakdown

- [ ] **Step 5: Final commit (if any UI tweaks needed)**

```bash
git add -A && git commit -m "fix: polish deep analysis UI after manual testing"
```
