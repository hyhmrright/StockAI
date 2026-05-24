# Phase 2: Multi-Agent Master Analysis + Sentiment Agent

> Design spec for bridging the gap between StockAI and [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) (MIT License, Copyright (c) virattt).

## Overview

Phase 2 adds two major capabilities to StockAI's analysis pipeline:

1. **Multi-Agent Master Analysis** — 13 investor persona agents (Warren Buffett, Ben Graham, Michael Burry, etc.), each performing independent LLM-based analysis with their unique investment philosophy
2. **Sentiment Agent** — structured news sentiment classification producing a quantitative signal

These run in a new "deep analysis" mode that users can opt into. The existing fast analysis (single LLM call) remains the default.

## Phased Roadmap (Context)

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Technical + Fundamental quant scoring | **Done** (v0.8.0) |
| **Phase 2** | **Multi-Agent Masters + Sentiment Agent** | **This spec** |
| Phase 3 | Valuation Agent (DCF/Owner Earnings) | Planned |
| Phase 4 | Risk Management / Portfolio Management | Planned |
| Phase 5 | Backtesting Framework | Planned |

## Architecture

### Data Flow (Deep Analysis Mode)

```
User clicks "深度分析"
        ↓
Rust layer spawns Sidecar (config includes masterAnalysis=true)
        ↓
┌─────────────────────────────────────────────┐
│  Step 1: Data Acquisition (reuse existing)   │
│  fetchMarketBundle() + fetchQuantBundle()    │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│  Step 2: Parallel Agent Execution            │
│  Promise.allSettled([                         │
│    buffettAgent.analyze(ctx),                 │
│    grahamAgent.analyze(ctx),                  │
│    ...selectedMasters,                        │
│    sentimentAgent.analyze(ctx),               │
│  ])                                           │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│  Step 3: Synthesis                           │
│  synthesizer.synthesize(masterSignals,       │
│    sentimentSignal, quantBundle)              │
│  → 1 LLM call for final summary             │
└──────────────┬──────────────────────────────┘
               ↓
        DeepAnalysisResult → stdout JSON
```

### Fast Mode (unchanged)

The existing pipeline remains: `fetchMarketBundle()` → `fetchQuantBundle()` → `buildEnhancedPrompt()` → single LLM call → `AIAnalysisResult`.

## File Structure

```
sidecar/
  agents/
    types.ts              # MasterAgent interface, MasterSignal, DeepAnalysisResult types
    registry.ts           # Master registry: id → agent mapping + metadata
    synthesizer.ts        # Aggregates all signals, calls LLM for final summary
    sentiment.ts          # News sentiment classification (1 LLM call)
    masters/
      warren-buffett.ts   # Value investing, moat analysis, margin of safety
      ben-graham.ts       # Deep value, net-net, earnings stability
      charlie-munger.ts   # Quality at fair price, mental models
      michael-burry.ts    # Contrarian deep value, tail risk
      cathie-wood.ts      # Disruptive innovation, growth trajectory
      peter-lynch.ts      # Ten-baggers, practical everyday investing
      phil-fisher.ts      # Scuttlebutt, qualitative growth research
      bill-ackman.ts      # Activist investing, bold positions
      mohnish-pabrai.ts   # Dhandho investing, low-risk asymmetric bets
      nassim-taleb.ts     # Antifragility, tail risk, Black Swan
      stanley-druckenmiller.ts  # Macro + growth, asymmetric opportunities
      aswath-damodaran.ts # DCF, intrinsic valuation, story + numbers
      rakesh-jhunjhunwala.ts    # Long-term wealth creation, Indian Bull
  deep-analysis.ts        # Orchestrator: coordinates agents + synthesizer

src/
  components/
    DeepAnalysis/
      DeepAnalysisPanel.tsx    # Container for deep analysis results
      MasterCard.tsx           # Individual master signal card
      SynthesisSummary.tsx     # Consensus + synthesis summary header
      SentimentBar.tsx         # News sentiment breakdown bar
```

## Type Definitions

### Core Types (`sidecar/agents/types.ts`)

```typescript
/** Master agent metadata */
export interface MasterMeta {
  id: string;               // kebab-case, e.g. 'warren-buffett'
  name: string;             // English display name
  nameZh: string;           // Chinese display name
  style: string;            // English investment style
  styleZh: string;          // Chinese investment style
  avatar: string;           // Avatar filename in frontend assets
  description: string;      // One-line philosophy (Chinese)
}

/** Individual master's analysis signal */
export interface MasterSignal {
  masterId: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;       // 0-100
  reasoning: string;        // LLM-generated reasoning (Chinese)
}

/** Sentiment analysis signal */
export interface SentimentSignal {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;       // 0-100
  newsBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
}

/** Complete deep analysis result */
export interface DeepAnalysisResult {
  masterSignals: MasterSignal[];
  sentiment: SentimentSignal;
  synthesis: {
    signal: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    summary: string;          // Comprehensive analysis summary (Chinese)
    consensus: number;        // 0-100, how aligned masters are
  };
}

/** Analysis context passed to each master agent */
export interface MasterAnalysisContext {
  symbol: string;
  quant: QuantBundle;         // Existing technical + fundamental data
  news: StockNews[];          // Scraped news articles
  provider: AIProvider;       // Reuse existing provider
}

/** Master agent interface */
export interface MasterAgent {
  meta: MasterMeta;
  analyze(ctx: MasterAnalysisContext): Promise<MasterSignal>;
}
```

### Shared Types Extension (`shared/types.ts`)

```typescript
// Add to existing types:

export interface DeepAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
  quant?: QuantBundle;
  deepAnalysis: DeepAnalysisResult;
}
```

### Config Extension (`shared/types.ts`)

```typescript
// Extend the config that flows through Rust → Sidecar:

// New fields in the config JSON:
//   masterAnalysis?: boolean         — enable deep master analysis
//   selectedMasters?: string[]       — which master IDs to use
```

## Master Agent Implementation Pattern

Each master agent follows a uniform pattern. The prompt content is adapted from ai-hedge-fund's Python implementation, translated to Chinese, and tailored to the data available in StockAI (QuantBundle + news, not financialdatasets.ai API).

### Pattern

```typescript
// sidecar/agents/masters/<name>.ts

import type { MasterAgent, MasterMeta, MasterAnalysisContext, MasterSignal } from '../types';

const meta: MasterMeta = {
  id: '<kebab-case-name>',
  name: '<English Name>',
  nameZh: '<中文名>',
  style: '<English Style>',
  styleZh: '<中文风格>',
  avatar: '<name>.png',
  description: '<一句话投资哲学>',
};

const SYSTEM_PROMPT = `你是<大师名>。根据提供的量化数据和新闻信息做出投资判断。

<投资哲学和分析框架——从 ai-hedge-fund 翻译并适配>

信号规则：
- bullish: <大师特定的看涨条件>
- bearish: <大师特定的看跌条件>
- neutral: <大师特定的中性条件>

置信度范围：
- 90-100%: <极高确信的条件>
- 70-89%: <较高确信的条件>
- 50-69%: <混合信号>
- 30-49%: <低确信>
- 10-29%: <极低确信>

用中文回复。推理控制在 200 字以内。只返回 JSON。`;

function buildUserPrompt(ctx: MasterAnalysisContext): string {
  // Extract data relevant to this master's philosophy from ctx.quant and ctx.news
  // Format into a concise facts section
}

async function analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
  const userPrompt = buildUserPrompt(ctx);
  try {
    const result = await ctx.provider.chat(SYSTEM_PROMPT, userPrompt);
    // Parse JSON response → { signal, confidence, reasoning }
    return { masterId: meta.id, ...parsed };
  } catch {
    return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: '分析数据不足' };
  }
}

export const agent: MasterAgent = { meta, analyze };
```

### Data Adaptation Strategy

ai-hedge-fund agents access rich financial data via `financialdatasets.ai` API (10 periods of metrics, line items like FCF, D&A, capex, etc.). StockAI has more limited data:

| Data | ai-hedge-fund | StockAI Availability |
|------|---------------|---------------------|
| ROE, Net Margin, Gross Margin | Yes | Yes (QuantBundle) |
| PE, PB | Yes | Yes (QuantBundle) |
| Debt/Asset, Current Ratio | Yes | Yes (QuantBundle) |
| Revenue/Earnings Growth | Yes | Yes (QuantBundle) |
| Free Cash Flow | Yes | **No** (Phase 3) |
| Capital Expenditure | Yes | **No** (Phase 3) |
| Outstanding Shares | Yes | **No** |
| Insider Trades | Yes | **No** |
| Multi-period History | 10 periods | 1 period (latest) |
| Technical Indicators | 5 strategies | 5 strategies (identical) |
| News | Sentiment-labeled | Raw text (sentiment via LLM) |

**Adaptation**: Masters that heavily depend on unavailable data (e.g., Buffett's intrinsic value calc needs FCF/capex) will have simplified analysis in Phase 2, to be enriched in Phase 3 when Valuation Agent adds DCF data. The prompts acknowledge data limitations and instruct the LLM to reason with available data only.

## 13 Master Agents — Prompt Design Source

Each master's prompt is adapted from the corresponding Python agent in ai-hedge-fund. Key adaptations:

| Master | ai-hedge-fund Source | StockAI Adaptation |
|--------|---------------------|-------------------|
| Warren Buffett | `warren_buffett.py` — 7 sub-analyses (fundamentals, consistency, moat, pricing power, book value, management, intrinsic value) | Condense to key metrics from QuantBundle; intrinsic value deferred to Phase 3 |
| Ben Graham | `ben_graham.py` — Margin of safety, earnings stability, net-net | Focus on PE/PB, debt, earnings stability from available data |
| Charlie Munger | `charlie_munger.py` — Quality + fair price | Quality assessment via ROE/margins, valuation via PE/PB |
| Michael Burry | `michael_burry.py` — Deep value + contrarian | Contrarian signals from technical oversold + fundamental strength |
| Cathie Wood | `cathie_wood.py` — Innovation + disruption | Growth metrics + news sentiment for innovation signals |
| Peter Lynch | `peter_lynch.py` — PEG ratio, ten-baggers | PEG from PE + growth rate; practical business assessment |
| Phil Fisher | `phil_fisher.py` — Scuttlebutt + quality growth | Growth consistency + margin trends |
| Bill Ackman | `bill_ackman.py` — Activist, bold positions | Value unlock potential from financials |
| Mohnish Pabrai | `mohnish_pabrai.py` — Dhandho, low-risk doubles | Risk/reward asymmetry from valuation + financials |
| Nassim Taleb | `nassim_taleb.py` — 7-dimension antifragility | Volatility analysis + tail risk from technical indicators |
| Stanley Druckenmiller | `stanley_druckenmiller.py` — Macro + growth | Growth trajectory + momentum signals |
| Aswath Damodaran | `aswath_damodaran.py` — DCF + story | Narrative + numbers synthesis; DCF deferred to Phase 3 |
| Rakesh Jhunjhunwala | `rakesh_jhunjhunwala.py` — Long-term wealth | Long-term value creation potential |

## Sentiment Agent

### Approach

Unlike ai-hedge-fund which uses pre-labeled sentiment from `financialdatasets.ai` and insider trade data, StockAI uses LLM-based sentiment classification on its already-scraped news articles.

### Implementation

```typescript
// sidecar/agents/sentiment.ts

const SENTIMENT_SYSTEM = `你是金融新闻情绪分析专家。
对每条新闻标注情绪倾向并给出整体判断。只返回 JSON。`;

function buildSentimentPrompt(news: StockNews[]): string {
  const items = news.map((n, i) =>
    `${i + 1}. ${n.title}${n.content ? '\n   ' + n.content.substring(0, 300) : ''}`
  ).join('\n\n');

  return `对以下 ${news.length} 条新闻逐条标注情绪：

${items}

返回格式：
{
  "items": [
    { "index": 1, "sentiment": "positive" | "negative" | "neutral" }
  ],
  "overall": "positive" | "negative" | "neutral"
}`;
}

// Post-processing: count positive/negative/neutral → compute signal + confidence
```

### Token Cost

1 LLM call for all news articles (typically 5-20 articles). Estimated ~500-1500 tokens.

## Synthesizer

### Local Pre-computation

Before calling LLM, compute locally:

1. **Consensus score**: `100 * max(bullishCount, bearishCount, neutralCount) / totalMasters`
2. **Weighted signal**: Sum of `confidence`-weighted signals across all masters
3. **Dominant direction**: The signal with highest confidence-weighted count

### LLM Synthesis

1 LLM call that receives:
- All master signals with reasoning (compact format)
- Quant summary (existing format)
- Sentiment summary (from sentiment agent)

Outputs comprehensive `synthesis` object.

### Total LLM Calls in Deep Mode

| Component | Calls |
|-----------|-------|
| Selected Masters (default 5) | 5 |
| Sentiment Agent | 1 |
| Synthesizer | 1 |
| **Total** | **7** |

With all 13 masters: 15 calls.

## Frontend Components

### DeepAnalysisPanel

Container component that renders when `deepAnalysis` data is present in the response.

Layout (top to bottom):
1. **SynthesisSummary** — Overall signal, confidence, consensus meter, summary text
2. **MasterCard grid** — Responsive grid of individual master cards (2-3 columns desktop, 1 column mobile)
3. **SentimentBar** — Horizontal bar showing positive/negative/neutral distribution

### MasterCard

Each card shows:
- Avatar icon + Chinese name
- Investment style tag (e.g. "价值投资")
- Signal badge (看涨/看跌/中性) with color coding
- Confidence percentage
- 1-2 sentence reasoning

### SynthesisSummary

Header section:
- Large signal indicator with confidence
- Consensus meter (e.g. "8/10 大师看涨, 共识度 85%")
- Summary paragraph from synthesizer

### SentimentBar

Stacked horizontal bar:
- Green segment = positive news count
- Red segment = negative news count
- Gray segment = neutral news count
- Overall signal label

## Settings Extension

### New Settings Fields

In the Settings page, add a new section "深度分析 / Deep Analysis":

- **启用大师分析** (`masterAnalysis: boolean`, default: `false`)
- **选择分析大师** (`selectedMasters: string[]`, default: `['warren-buffett', 'ben-graham', 'michael-burry', 'cathie-wood', 'aswath-damodaran']`)
  - Multi-select checklist with all 13 masters
  - Each shows: avatar, Chinese name, style tag

### Config Flow

Settings → `settings.json` (Tauri store) → Rust `resolve_config()` → Sidecar CLI arg JSON → `configResolver.ts`

New fields added to the config JSON:
```json
{
  "provider": "openai",
  "apiKey": "...",
  "baseUrl": "...",
  "modelName": "gpt-4o",
  "deepMode": true,
  "masterAnalysis": true,
  "selectedMasters": ["warren-buffett", "ben-graham", "michael-burry"]
}
```

## Sidecar CLI Extension

### New Action

```bash
# Existing: fast analysis
sidecar <symbol> <config-json>

# New: deep master analysis (triggered when config has masterAnalysis=true)
# No new CLI flag needed — the masterAnalysis field in config-json controls the mode
```

When `masterAnalysis` is `true` in the config, the sidecar automatically runs the deep analysis pipeline instead of the fast path. The orchestrator in `deep-analysis.ts` manages the flow.

### Output Format

Deep analysis outputs a `DeepAnalysisResponse` JSON to stdout, which extends the existing `FullAnalysisResponse` with the `deepAnalysis` field.

## Rust Layer Changes

Minimal changes needed:

1. Pass `masterAnalysis` and `selectedMasters` through in the config JSON (already handled by generic JSON passthrough)
2. No new Tauri commands — the existing `start_analysis` command works, just with richer output
3. Frontend detects `deepAnalysis` field in response to render the new UI

## Error Handling

- Individual master agent failures: graceful degradation → `{ signal: 'neutral', confidence: 50, reasoning: '分析失败' }`
- If all masters fail: fall back to fast analysis mode
- Sentiment agent failure: skip sentiment, proceed with master signals only
- Synthesizer failure: compute synthesis locally (weighted vote) without LLM summary

## Attribution

The investment philosophy prompts and analysis frameworks are adapted from the [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) project by virattt, licensed under the MIT License.

An `ATTRIBUTION.md` file will be placed in `sidecar/agents/` crediting the source.

## Testing Strategy

### Unit Tests
- Each master agent: mock LLM → verify prompt construction + response parsing
- Sentiment agent: mock LLM → verify news formatting + signal computation
- Synthesizer: mock signals → verify consensus calculation + LLM prompt
- Registry: verify master lookup, default selection

### Integration Tests
- `deep-analysis.ts` orchestrator with mocked providers
- End-to-end with real LLM (manual/CI-optional)

### Frontend Tests
- MasterCard rendering with various signal states
- SynthesisSummary with edge cases (all bullish, all bearish, split)
- SentimentBar proportions
- Settings: master selection persistence

## Future Phases (Out of Scope)

- **Phase 3**: Valuation Agent (DCF/WACC/Owner Earnings) — will enrich Buffett/Graham/Damodaran agents with intrinsic value data
- **Phase 4**: Risk Management / Portfolio Management — multi-stock analysis, correlation, position sizing
- **Phase 5**: Backtesting Framework — historical validation of master signals
