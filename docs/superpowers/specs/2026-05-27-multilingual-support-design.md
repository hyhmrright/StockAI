# Multilingual Support Design

**Date:** 2026-05-27  
**Status:** Approved  
**Scope:** UI text + AI analysis output; 中文 / English / 日本語

---

## 1. Goals

- Users can switch the app language (zh / en / ja) from Settings → General tab.
- All UI text switches immediately; AI analysis generated after the switch uses the new language.
- Historical analysis records retain the language they were generated in (no re-translation).

## 2. Translation Layer (`src/i18n/`)

### File structure

```
src/i18n/
  zh.json       # Chinese translations (canonical key source)
  en.json       # English translations
  ja.json       # Japanese translations
  index.ts      # Type definitions + loader
```

### `index.ts` exports

```ts
export type Language = 'zh' | 'en' | 'ja';
export type TranslationKey = keyof typeof import('./zh.json');
export function getTranslations(lang: Language): Record<TranslationKey, string>;
```

TypeScript enforces that `en.json` and `ja.json` contain all keys present in `zh.json` (via the shared `TranslationKey` type).

### `src/hooks/useLanguage.ts`

```ts
export function useLanguage(): { language: Language; t: (key: TranslationKey) => string }
```

Reads `settings.language` from the existing `useSettings()` singleton store. No extra Context Provider needed — settings are already globally shared.

## 3. Settings Changes

### `useSettings.ts`

Add to `Settings` interface:

```ts
language: Language;   // default: 'zh'
```

Persisted to `tauri-plugin-store` alongside existing settings. Version migration: existing saves without `language` field fall back to `'zh'` via the deep-merge logic already in `loadSettings()`.

### `SettingsModal.tsx`

Activate the existing unused `general` tab. Add a language picker (radio group or `<select>`):

```
○ 中文
○ English
○ 日本語
```

Selecting a language immediately calls `updateSettings({ language })`.

## 4. Sidecar Language Switching

### Config propagation

`language` is added to the JSON config object already passed as `process.argv[3]` from Rust → Sidecar. No Rust changes needed.

### `sidecar/prompts.ts`

Split each hardcoded Chinese string into three language variants:

```ts
const SYSTEM_PROMPT: Record<Language, string> = { zh: '...', en: '...', ja: '...' };
const ROLE_INSTRUCTIONS: Record<Language, string> = { ... };
const FORMAT_INSTRUCTIONS: Record<Language, string> = { ... };

export function buildAnalysisPrompt(
  symbol: string,
  news: StockNews[],
  language: Language = 'zh',
  contentLimit = 1000
): string
```

**JSON key constraint:** The response JSON structure keys (`rating`, `sentiment`, `bullish`, `bearish`, `neutral`, `pros`, `cons`, `sector`, `industry`, `description`) must always remain in English regardless of `language`, because the frontend parses them by field name. Only the natural-language *values* (`summary` text, `pros`/`cons` array strings, `sector`/`industry`/`description` text) are written in the target language. `FORMAT_INSTRUCTIONS` must make this explicit to the LLM.

### `sidecar/agents/` (Multi-Agent)

`MasterAgent.analyze()` receives an optional `language` parameter, forwarded to each master's prompt builder. The synthesizer and sentiment modules follow the same pattern.

### `sidecar/configResolver.ts`

Parse the new `language` field; default to `'zh'` when absent (backward compatibility).

## 5. What Is NOT Translated

| Content | Reason |
|---------|--------|
| Stock codes and company names | Come from external APIs |
| Historical record `summary`/`pros`/`cons` | Frozen at generation time |
| Quant metric values, chart axis labels | Numeric / universal abbreviations |

## 6. UI Components Requiring Updates

All components call `const { t } = useLanguage()` and replace hardcoded strings with `t('key')`.

| Component | Key text to replace |
|-----------|-------------------|
| `SettingsModal.tsx` | Tab labels, field labels, save button |
| `SearchHeader.tsx` | Search placeholder, hint text |
| `AnalysisPanel.tsx` | Analysis status messages, score labels |
| `Dashboard.tsx` | Panel titles, data labels |
| `Watchlist.tsx` | Watchlist UI text |
| `QuantScoreCard.tsx` | Quant dimension labels |
| `RiskCard.tsx` | Risk level labels |
| `ValuationCard.tsx` | Valuation labels |
| `AlertConfig.tsx` | Price alert UI text |
| `HistoryTimeline.tsx` | History record type labels |

## 7. Testing Strategy

- Unit test `useLanguage`: switching language returns correct translation strings for all three locales.
- Unit test `buildAnalysisPrompt`: passing `language = 'en'` produces an English prompt; `'ja'` produces a Japanese prompt.
- TypeScript compile-time: missing keys in `en.json` / `ja.json` cause a type error.
- Manual: toggle language in Settings and verify UI text switches; run an analysis and verify the output language matches the setting.

## 8. Out of Scope

- Right-to-left (RTL) layout support
- Locale-specific number/date formatting
- Auto-detection of system language
- Re-translating existing history records
