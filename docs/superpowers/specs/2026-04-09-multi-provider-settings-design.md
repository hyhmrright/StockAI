# Multi-Provider Settings Redesign

**Date:** 2026-04-09  
**Status:** Approved

## Overview

Redesign the "模型服务" settings panel to support four AI providers — OpenAI, Ollama, Anthropic, DeepSeek — with independent per-provider configuration stored simultaneously. The user selects the active provider via a dropdown; each provider retains its own apiKey, baseUrl, and model between switches.

---

## Data Model

### New `Settings` interface (`src/hooks/useSettings.ts`)

```ts
export type ProviderType = "openai" | "ollama" | "anthropic" | "deepseek";

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  activeProvider: ProviderType;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  autoAnalyze: boolean;
  deepMode: boolean;
}
```

### Per-provider defaults (`src/hooks/useSettings.ts`)

```ts
export const PROVIDER_DEFAULTS: Record<ProviderType, ProviderConfig> = {
  openai:    { apiKey: "", baseUrl: "https://api.openai.com/v1",        model: "gpt-4o" },
  ollama:    { apiKey: "", baseUrl: "http://localhost:11434",            model: "qwen3.5:9b" },
  anthropic: { apiKey: "", baseUrl: "https://api.anthropic.com",        model: "claude-3-5-sonnet-20241022" },
  deepseek:  { apiKey: "", baseUrl: "https://api.deepseek.com/v1",      model: "deepseek-chat" },
};
```

### Migration from old format

On first load, if `activeProvider` is absent but `provider` exists, migrate:
```
old.provider    → settings.activeProvider
old.apiKey      → settings.providerConfigs[old.provider].apiKey
old.baseUrl     → settings.providerConfigs[old.provider].baseUrl
old.aiModel     → settings.providerConfigs[old.provider].model
```

---

## Rust Config Mapping

`src-tauri/src/lib.rs` reads `activeProvider` and `providerConfigs[activeProvider]` from `settings.json`:

```rust
let provider  = s.get("activeProvider").and_then(|v| v.as_str())
                  .or_else(|| s.get("provider").and_then(|v| v.as_str()));  // fallback

let provider_configs = s.get("providerConfigs").and_then(|v| v.as_object());
let active_config = provider_configs
    .and_then(|m| provider.and_then(|p| m.get(p)))
    .and_then(|v| v.as_object());

// apiKey, baseUrl, aiModel read from active_config
```

---

## Frontend UI

### `ProviderSelector.tsx`

Layout (top → bottom):

1. **Provider dropdown** — styled `<select>` with icon + label per option:
   - 🤖 OpenAI
   - 🦙 Ollama
   - 🔷 Anthropic
   - 🐋 DeepSeek

   On change: switch `activeProvider`, merge defaults into `providerConfigs[newProvider]` if not yet configured.

2. **Config form** — rendered below the dropdown, fields shared across all providers:

   | Field | OpenAI | Ollama | Anthropic | DeepSeek |
   |-------|--------|--------|-----------|---------|
   | API Key | ✓ | — | ✓ | ✓ |
   | Base URL | optional | ✓ | — | optional |
   | Model Name | ✓ | ✓ (+ fetch btn) | ✓ | ✓ |

   All fields use the existing `FormInput` component. The Ollama "Fetch models" button is retained.

### Removed files

`OpenAIForm.tsx` and `OllamaForm.tsx` are replaced by a single unified `ProviderForm.tsx` that conditionally renders fields based on the active provider.

### `AnthropicForm` fields

Not a separate file — handled inside `ProviderForm.tsx`:
- API Key (required)
- Model name (text input; no fetch button — model list is static)

---

## Sidecar Layer

### New provider: `sidecar/providers/anthropic.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";

export class AnthropicProvider implements AIProvider {
  constructor(private apiKey: string, private model: string) {}
  async analyze(symbol: string, news: StockNews[]): Promise<AIAnalysisResult> { ... }
}
```

Uses `buildAnalysisPrompt()` from `prompts.ts`. Returns `AIAnalysisResult`.

### DeepSeek: reuse `OpenAIProvider`

DeepSeek's API is fully OpenAI-compatible. `registry.ts` creates an `OpenAIProvider` with DeepSeek's base URL:

```ts
case 'deepseek':
  return new OpenAIProvider(
    config.apiKey || '',
    config.baseUrl || PROVIDER_DEFAULTS.deepseek.baseUrl,
    config.model   || PROVIDER_DEFAULTS.deepseek.model
  );
```

### `sidecar/config.ts` additions

```ts
export const PROVIDER_DEFAULTS = {
  ...existing openai/ollama...
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-5-sonnet-20241022" },
  deepseek:  { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
};
```

### `sidecar/providers/registry.ts` additions

Add `anthropic` and `deepseek` cases to `createProvider()`.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `src/hooks/useSettings.ts` | Rewrite Settings interface + migration + defaults; remove `PROVIDER_BASE_URLS` export |
| `src/components/settings/ProviderSelector.tsx` | Dropdown + delegate to ProviderForm |
| `src/components/settings/ProviderForm.tsx` | New: unified config form for all providers |
| `src/components/settings/OpenAIForm.tsx` | Delete |
| `src/components/settings/OllamaForm.tsx` | Delete |
| `src-tauri/src/lib.rs` | Read `activeProvider` + `providerConfigs` |
| `sidecar/config.ts` | Add anthropic/deepseek defaults |
| `sidecar/providers/anthropic.ts` | New: Anthropic SDK provider |
| `sidecar/providers/registry.ts` | Register anthropic + deepseek |
| `sidecar/index.ts` | No change (already passes provider string through) |
| `package.json` (root) | Add `@anthropic-ai/sdk` (sidecar uses root deps) |

---

## Error Handling

- Missing API key → sidecar catches the SDK auth error, returns `{ error: "..." }` to frontend via existing path
- Invalid model name → same path
- Ollama not running → existing timeout/error path unchanged

---

## Testing

- Update `sidecar/providers/registry.test.ts`: add `anthropic` and `deepseek` cases
- Update `useSettings` migration test (if exists) to cover new format
- `ProviderForm` is pure UI with no business logic; no new unit tests needed
