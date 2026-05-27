# Multilingual Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zh/en/ja language support — UI text and AI analysis output both follow the user-selected language stored in Settings.

**Architecture:** A `Language` type flows from `shared/types.ts` through `useSettings` → `useLanguage` hook (UI side) and `configResolver` → prompts/providers/agents (sidecar side). No new dependencies; JSON translation files + React hook pattern.

**Tech Stack:** TypeScript, React, Bun (sidecar), Vite, Tauri

---

## File Map

| Action | Path |
|--------|------|
| Modify | `shared/types.ts` |
| Modify | `src/hooks/useSettings.ts` |
| Create | `src/i18n/zh.json` |
| Create | `src/i18n/en.json` |
| Create | `src/i18n/ja.json` |
| Create | `src/i18n/index.ts` |
| Create | `src/hooks/useLanguage.ts` |
| Create | `src/hooks/useLanguage.test.ts` |
| Modify | `src/components/settings/GeneralForm.tsx` |
| Modify | `sidecar/configResolver.ts` |
| Modify | `sidecar/configResolver.test.ts` |
| Modify | `sidecar/prompts.ts` |
| Modify | `sidecar/prompts.test.ts` |
| Modify | `sidecar/ai.ts` |
| Modify | `sidecar/providers/openai.ts` |
| Modify | `sidecar/providers/anthropic.ts` |
| Modify | `sidecar/providers/ollama.ts` |
| Modify | `sidecar/analysis.ts` |
| Modify | `sidecar/agents/types.ts` |
| Modify | `sidecar/agents/masters/factory.ts` |
| Modify | `sidecar/agents/synthesizer.ts` |
| Modify | `sidecar/agents/sentiment.ts` |
| Modify | `sidecar/deep-analysis.ts` |
| Modify | `sidecar/cli-handlers.ts` |
| Modify | `src/components/SettingsModal.tsx` |
| Modify | `src/components/SearchHeader.tsx` |
| Modify | `src/components/AnalysisPanel.tsx` |
| Modify | `src/components/QuantScoreCard.tsx` |
| Modify | `src/components/SentimentBar.tsx` |
| Modify | `src/components/RiskCard.tsx` |
| Modify | `src/components/ValuationCard.tsx` |
| Modify | `src/components/Watchlist.tsx` |
| Modify | `src/components/AnalysisHistory/HistoryTimeline.tsx` |
| Modify | `src/components/DeepAnalysis/SentimentBreakdown.tsx` |

---

## Task 1: Add `Language` type and update `Settings`

**Files:**
- Modify: `shared/types.ts`
- Modify: `src/hooks/useSettings.ts`

- [ ] **Step 1: Add `Language` type to `shared/types.ts`**

  After the `ProviderType` line (currently line 33), add:

  ```ts
  /** 界面与 AI 回答语言 */
  export type Language = 'zh' | 'en' | 'ja';
  ```

- [ ] **Step 2: Add `language` field to `Settings` in `useSettings.ts`**

  In the `Settings` interface, add `language: Language` after `selectedMasters`:

  ```ts
  import { ProviderType, Language } from "../../shared/types";
  export type { ProviderType, Language };

  export interface Settings {
    _version: string;
    activeProvider: ProviderType;
    providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
    autoAnalyze: boolean;
    deepMode: boolean;
    masterAnalysis: boolean;
    selectedMasters: string[];
    language: Language;
  }
  ```

  Update `DEFAULT_SETTINGS` to include `language: 'zh'`:

  ```ts
  export const DEFAULT_SETTINGS: Settings = {
    _version: CONFIG_VERSION,
    ...SHARED_DEFAULT_SETTINGS,
    masterAnalysis: false,
    selectedMasters: DEFAULT_SELECTED_MASTERS,
    language: 'zh',
    providerConfigs: {
      ollama: {
        apiKey: "",
        baseUrl: PROVIDER_PROFILES.ollama.baseUrl,
        model: PROVIDER_PROFILES.ollama.model,
      },
    },
  };
  ```

- [ ] **Step 3: Run typecheck to confirm no errors**

  Run: `cd /Users/hyh/code/StockAI && bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add shared/types.ts src/hooks/useSettings.ts
  git commit -m "feat(i18n): add Language type and language field to Settings"
  ```

---

## Task 2: Create translation files and `useLanguage` hook

**Files:**
- Create: `src/i18n/zh.json`
- Create: `src/i18n/en.json`
- Create: `src/i18n/ja.json`
- Create: `src/i18n/index.ts`
- Create: `src/hooks/useLanguage.ts`
- Create: `src/hooks/useLanguage.test.ts`

- [ ] **Step 1: Create `src/i18n/zh.json`**

  ```json
  {
    "settings_title": "系统设置",
    "tab_general": "常规设置",
    "tab_providers": "模型服务",
    "tab_masters": "大师分析",
    "title_general": "常规设置",
    "title_providers": "模型服务配置",
    "title_masters": "大师分析设置",
    "saving": "正在保存...",
    "saved": "设置已成功保存",
    "close": "关闭",
    "save_changes": "保存更改",
    "auto_analyze_label": "切换股票时自动 AI 分析",
    "auto_analyze_desc": "开启后每次切换股票都会自动调用 LLM（消耗 tokens）；默认关闭，需手动点击右侧分析按钮",
    "deep_mode_label": "深度模式",
    "deep_mode_desc": "分析时提取新闻全文，耗时较长但准确度更高",
    "language_label": "界面语言",
    "lang_zh": "中文",
    "lang_en": "English",
    "lang_ja": "日本語",
    "search_placeholder": "搜索股票代码或名称 (例如: AAPL, 隆基绿能, 300866)...",
    "analyzing": "分析中...",
    "start_analysis": "开始分析",
    "bullish": "看涨",
    "bearish": "看跌",
    "neutral": "中性",
    "pros": "利多因素",
    "cons": "风险提示",
    "deep_analyzing": "深度分析中...",
    "deep_analysis": "深度大师分析",
    "technical_view": "技术面解读",
    "fundamental_view": "基本面解读",
    "risk_assessment": "风险评估",
    "low_risk": "低风险",
    "medium_risk": "中风险",
    "high_risk": "高风险",
    "valuation_analysis": "估值分析",
    "no_watchlist": "暂无关注，输入代码添加",
    "no_history": "暂无历史分析记录",
    "no_data": "暂无数据",
    "type_ai": "AI",
    "type_deep": "深度",
    "type_quant": "量化",
    "type_backtest": "回测",
    "type_screener": "筛选",
    "technical": "技术面",
    "fundamental": "基本面",
    "delete": "删除",
    "news_sentiment": "新闻情绪",
    "news_count": "{n} 条新闻",
    "sentiment_positive": "正面 {n}",
    "sentiment_neutral_label": "中性 {n}",
    "sentiment_negative": "负面 {n}",
    "just_now": "刚刚",
    "minutes_ago": "{n} 分钟前",
    "hours_ago": "{n} 小时前",
    "days_ago": "{n} 天前"
  }
  ```

- [ ] **Step 2: Create `src/i18n/en.json`**

  ```json
  {
    "settings_title": "Settings",
    "tab_general": "General",
    "tab_providers": "Providers",
    "tab_masters": "Masters",
    "title_general": "General Settings",
    "title_providers": "Provider Configuration",
    "title_masters": "Master Analysis Settings",
    "saving": "Saving...",
    "saved": "Settings saved",
    "close": "Close",
    "save_changes": "Save Changes",
    "auto_analyze_label": "Auto-analyze on stock switch",
    "auto_analyze_desc": "When enabled, switching stocks automatically calls the LLM (costs tokens). Off by default — use the Analyze button manually.",
    "deep_mode_label": "Deep Mode",
    "deep_mode_desc": "Fetches full article text during analysis. Slower but more accurate.",
    "language_label": "Interface Language",
    "lang_zh": "中文",
    "lang_en": "English",
    "lang_ja": "日本語",
    "search_placeholder": "Search by ticker or name (e.g. AAPL, 600519)...",
    "analyzing": "Analyzing...",
    "start_analysis": "Analyze",
    "bullish": "Bullish",
    "bearish": "Bearish",
    "neutral": "Neutral",
    "pros": "Positives",
    "cons": "Risks",
    "deep_analyzing": "Deep analysis...",
    "deep_analysis": "Deep Master Analysis",
    "technical_view": "Technical View",
    "fundamental_view": "Fundamental View",
    "risk_assessment": "Risk Assessment",
    "low_risk": "Low Risk",
    "medium_risk": "Medium Risk",
    "high_risk": "High Risk",
    "valuation_analysis": "Valuation",
    "no_watchlist": "No stocks in watchlist. Enter a ticker to add one.",
    "no_history": "No analysis history yet.",
    "no_data": "No data",
    "type_ai": "AI",
    "type_deep": "Deep",
    "type_quant": "Quant",
    "type_backtest": "Backtest",
    "type_screener": "Screener",
    "technical": "Technical",
    "fundamental": "Fundamental",
    "delete": "Delete",
    "news_sentiment": "News Sentiment",
    "news_count": "{n} news",
    "sentiment_positive": "Positive {n}",
    "sentiment_neutral_label": "Neutral {n}",
    "sentiment_negative": "Negative {n}",
    "just_now": "Just now",
    "minutes_ago": "{n}m ago",
    "hours_ago": "{n}h ago",
    "days_ago": "{n}d ago"
  }
  ```

- [ ] **Step 3: Create `src/i18n/ja.json`**

  ```json
  {
    "settings_title": "設定",
    "tab_general": "一般",
    "tab_providers": "プロバイダー",
    "tab_masters": "マスター",
    "title_general": "一般設定",
    "title_providers": "プロバイダー設定",
    "title_masters": "マスター分析設定",
    "saving": "保存中...",
    "saved": "設定が保存されました",
    "close": "閉じる",
    "save_changes": "変更を保存",
    "auto_analyze_label": "銘柄切替時に自動AI分析",
    "auto_analyze_desc": "有効にすると銘柄切替のたびにLLMを呼び出します（トークン消費）。デフォルトはオフ。",
    "deep_mode_label": "ディープモード",
    "deep_mode_desc": "記事全文を取得して分析します。時間がかかりますが精度が向上します。",
    "language_label": "表示言語",
    "lang_zh": "中文",
    "lang_en": "English",
    "lang_ja": "日本語",
    "search_placeholder": "銘柄コードまたは名称で検索 (例: AAPL, 600519)...",
    "analyzing": "分析中...",
    "start_analysis": "分析開始",
    "bullish": "強気",
    "bearish": "弱気",
    "neutral": "中立",
    "pros": "ポジティブ要因",
    "cons": "リスク要因",
    "deep_analyzing": "詳細分析中...",
    "deep_analysis": "マスター詳細分析",
    "technical_view": "テクニカル分析",
    "fundamental_view": "ファンダメンタル分析",
    "risk_assessment": "リスク評価",
    "low_risk": "低リスク",
    "medium_risk": "中リスク",
    "high_risk": "高リスク",
    "valuation_analysis": "バリュエーション",
    "no_watchlist": "ウォッチリストは空です。コードを入力して追加してください。",
    "no_history": "分析履歴はありません。",
    "no_data": "データなし",
    "type_ai": "AI",
    "type_deep": "詳細",
    "type_quant": "クオンツ",
    "type_backtest": "バックテスト",
    "type_screener": "スクリーナー",
    "technical": "テクニカル",
    "fundamental": "ファンダメンタル",
    "delete": "削除",
    "news_sentiment": "ニュース感情",
    "news_count": "{n}件",
    "sentiment_positive": "ポジ {n}",
    "sentiment_neutral_label": "中立 {n}",
    "sentiment_negative": "ネガ {n}",
    "just_now": "たった今",
    "minutes_ago": "{n}分前",
    "hours_ago": "{n}時間前",
    "days_ago": "{n}日前"
  }
  ```

- [ ] **Step 4: Create `src/i18n/index.ts`**

  ```ts
  import zhData from './zh.json';
  import enData from './en.json';
  import jaData from './ja.json';
  import type { Language } from '../../shared/types';

  export type { Language };
  export type TranslationKey = keyof typeof zhData;

  // 编译期静态校验：en/ja 必须包含 zh 的全部 key
  type AssertComplete<T extends Record<TranslationKey, string>> = T;
  type _En = AssertComplete<typeof enData>;
  type _Ja = AssertComplete<typeof jaData>;

  const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
    zh: zhData,
    en: enData as Record<TranslationKey, string>,
    ja: jaData as Record<TranslationKey, string>,
  };

  export function getTranslations(lang: Language): Record<TranslationKey, string> {
    return TRANSLATIONS[lang];
  }
  ```

- [ ] **Step 5: Create `src/hooks/useLanguage.ts`**

  ```ts
  import { useMemo } from 'react';
  import { useSettings } from './useSettings';
  import { getTranslations } from '../i18n';
  import type { Language, TranslationKey } from '../i18n';

  export type { Language };

  export function useLanguage() {
    const { settings } = useSettings();
    const lang: Language = settings.language ?? 'zh';
    const translations = useMemo(() => getTranslations(lang), [lang]);

    function t(key: TranslationKey, vars?: Record<string, string | number>): string {
      let str = translations[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    }

    return { language: lang, t };
  }
  ```

- [ ] **Step 6: Write failing test `src/hooks/useLanguage.test.ts`**

  ```ts
  import { describe, test, expect, mock } from 'bun:test';
  import { getTranslations } from '../i18n';

  describe('getTranslations', () => {
    test('zh returns Chinese strings', () => {
      const t = getTranslations('zh');
      expect(t.bullish).toBe('看涨');
      expect(t.bearish).toBe('看跌');
      expect(t.neutral).toBe('中性');
    });

    test('en returns English strings', () => {
      const t = getTranslations('en');
      expect(t.bullish).toBe('Bullish');
      expect(t.bearish).toBe('Bearish');
      expect(t.neutral).toBe('Neutral');
    });

    test('ja returns Japanese strings', () => {
      const t = getTranslations('ja');
      expect(t.bullish).toBe('強気');
      expect(t.bearish).toBe('弱気');
      expect(t.neutral).toBe('中立');
    });

    test('en has all zh keys', () => {
      const zh = getTranslations('zh');
      const en = getTranslations('en');
      for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
        expect(en[key]).toBeDefined();
      }
    });

    test('ja has all zh keys', () => {
      const zh = getTranslations('zh');
      const ja = getTranslations('ja');
      for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
        expect(ja[key]).toBeDefined();
      }
    });
  });
  ```

- [ ] **Step 7: Run test to verify it passes**

  Run: `cd sidecar && bun test ../src/hooks/useLanguage.test.ts`

  Wait — this is a frontend test. Run:
  ```
  bunx vitest run src/hooks/useLanguage.test.ts
  ```
  Expected: PASS (the test only exercises `getTranslations` from `src/i18n/index.ts`)

- [ ] **Step 8: Commit**

  ```bash
  git add src/i18n/ src/hooks/useLanguage.ts src/hooks/useLanguage.test.ts
  git commit -m "feat(i18n): add translation files and useLanguage hook"
  ```

---

## Task 3: Add language picker to `GeneralForm`

**Files:**
- Modify: `src/components/settings/GeneralForm.tsx`

- [ ] **Step 1: Add language picker to `GeneralForm.tsx`**

  Replace the full file content with:

  ```tsx
  import React from "react";
  import { Settings } from "../../hooks/useSettings";
  import type { Language } from "../../hooks/useLanguage";

  interface GeneralFormProps {
    settings: Settings;
    onChange: (s: Partial<Settings>) => void;
  }

  interface ToggleProps {
    enabled: boolean;
    onToggle: () => void;
  }

  function Toggle({ enabled, onToggle }: ToggleProps) {
    return (
      <button
        onClick={onToggle}
        className={`w-10 h-5 rounded-full relative transition-colors ${
          enabled ? "bg-emerald-500/30" : "bg-gray-800"
        }`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-all ${
          enabled ? "right-0.5 bg-emerald-400" : "left-0.5 bg-gray-500"
        }`} />
      </button>
    );
  }

  const LANGUAGES: { value: Language; label: string }[] = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ];

  export const GeneralForm: React.FC<GeneralFormProps> = ({ settings, onChange }) => {
    return (
      <div className="space-y-6">
        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-title text-gray-200">切换股票时自动 AI 分析</span>
            <span className="setting-desc text-gray-500 text-xs">开启后每次切换股票都会自动调用 LLM（消耗 tokens）；默认关闭，需手动点击右侧分析按钮</span>
          </div>
          <Toggle
            enabled={settings.autoAnalyze}
            onToggle={() => onChange({ autoAnalyze: !settings.autoAnalyze })}
          />
        </div>
        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-title text-gray-200">深度模式</span>
            <span className="setting-desc text-gray-500 text-xs">分析时提取新闻全文，耗时较长但准确度更高</span>
          </div>
          <Toggle
            enabled={settings.deepMode}
            onToggle={() => onChange({ deepMode: !settings.deepMode })}
          />
        </div>
        <div className="setting-row">
          <div className="setting-label">
            <span className="setting-title text-gray-200">界面语言 / Language</span>
            <span className="setting-desc text-gray-500 text-xs">UI and AI analysis output language</span>
          </div>
          <div className="flex gap-2">
            {LANGUAGES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onChange({ language: value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  settings.language === value
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };
  ```

- [ ] **Step 2: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/settings/GeneralForm.tsx
  git commit -m "feat(i18n): add language picker to GeneralForm"
  ```

---

## Task 4: Update `configResolver` for language

**Files:**
- Modify: `sidecar/configResolver.ts`
- Modify: `sidecar/configResolver.test.ts`

- [ ] **Step 1: Write failing test in `configResolver.test.ts`**

  Add inside the `describe("resolveConfig")` block:

  ```ts
  test("language 字段存在时正确读取", () => {
    const cfg = resolveConfig({ ...validConfig, language: 'en' });
    expect(cfg.language).toBe('en');
  });

  test("language 字段缺失时默认 zh", () => {
    const cfg = resolveConfig(validConfig);
    expect(cfg.language).toBe('zh');
  });

  test("language 值无效时回退到 zh", () => {
    const cfg = resolveConfig({ ...validConfig, language: 'fr' });
    expect(cfg.language).toBe('zh');
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  Run: `cd sidecar && bun test configResolver.test.ts`
  Expected: 3 new tests FAIL with "cfg.language is undefined"

- [ ] **Step 3: Update `configResolver.ts`**

  Add `Language` import and `language` field to `ResolvedConfig`:

  ```ts
  import { PROVIDER_PROFILES, CONFIG_VERSION, DEFAULT_SELECTED_MASTERS } from '../shared/constants';
  import type { ProviderType, Language } from '../shared/types';

  export interface ResolvedConfig {
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    modelName: string;
    deepMode: boolean;
    masterAnalysis: boolean;
    selectedMasters: string[];
    language: Language;
  }
  ```

  In `resolveConfig`, add to the returned object:

  ```ts
  const VALID_LANGUAGES: Language[] = ['zh', 'en', 'ja'];
  const rawLang = obj.language;
  const language: Language = VALID_LANGUAGES.includes(rawLang) ? rawLang as Language : 'zh';

  return {
    provider,
    apiKey:    providerCfg.apiKey   ?? '',
    baseUrl:   providerCfg.baseUrl  ?? defaults.baseUrl,
    modelName: providerCfg.model    ?? defaults.model,
    deepMode:  obj.deepMode !== false,
    masterAnalysis: obj.masterAnalysis === true,
    selectedMasters: Array.isArray(obj.selectedMasters) ? obj.selectedMasters : DEFAULT_SELECTED_MASTERS,
    language,
  };
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd sidecar && bun test configResolver.test.ts`
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add sidecar/configResolver.ts sidecar/configResolver.test.ts
  git commit -m "feat(i18n): add language field to ResolvedConfig"
  ```

---

## Task 5: Multilingual `prompts.ts`

**Files:**
- Modify: `sidecar/prompts.ts`
- Modify: `sidecar/prompts.test.ts`

- [ ] **Step 1: Update `prompts.test.ts` with language tests**

  Add to end of file:

  ```ts
  describe("buildAnalysisPrompt with language", () => {
    const news = [createMockNews({ title: "Apple releases iPhone", source: "Reuters", content: "Apple unveiled a new iPhone series at its annual fall event. The device features the latest chip." })];

    test("language='en' 时 prompt 包含英文角色指令", () => {
      const prompt = buildAnalysisPrompt("AAPL", news, 'en');
      expect(prompt).toContain("senior financial analyst");
    });

    test("language='ja' 時 prompt 包含日文角色指令", () => {
      const prompt = buildAnalysisPrompt("AAPL", news, 'ja');
      expect(prompt).toContain("アナリスト");
    });

    test("language='zh' 时行为与不传语言一致", () => {
      const prompt1 = buildAnalysisPrompt("AAPL", news, 'zh');
      const prompt2 = buildAnalysisPrompt("AAPL", news);
      expect(prompt1).toBe(prompt2);
    });
  });

  describe("getSystemPrompt", () => {
    test("zh 返回中文 system prompt", () => {
      expect(getSystemPrompt('zh')).toContain("金融分析师");
    });
    test("en 返回英文 system prompt", () => {
      expect(getSystemPrompt('en')).toContain("financial analyst");
    });
    test("ja 返回日文 system prompt", () => {
      expect(getSystemPrompt('ja')).toContain("金融アナリスト");
    });
  });
  ```

  Also update the existing `SYSTEM_PROMPT` test to use `getSystemPrompt`:

  ```ts
  // 将 describe("SYSTEM_PROMPT") 中的测试改为：
  describe("getSystemPrompt", () => {
    test("包含金融分析师角色定义", () => {
      expect(getSystemPrompt('zh')).toContain("金融分析师");
    });
    test("要求 JSON 纯文本格式", () => {
      expect(getSystemPrompt('zh')).toContain("JSON");
    });
    // ... （后续新增的测试可合并进来）
  });
  ```

  Update the `contentLimit` test to pass `'zh'` as 3rd arg:

  ```ts
  const prompt500 = buildAnalysisPrompt("AAPL", longNews, 'zh', 500);
  ```

- [ ] **Step 2: Run failing tests**

  Run: `cd sidecar && bun test prompts.test.ts`
  Expected: new tests FAIL (getSystemPrompt not exported, language param missing)

- [ ] **Step 3: Rewrite `sidecar/prompts.ts`**

  Replace the entire file with:

  ```ts
  import type { StockNews, QuantBundle, Language } from '../shared/types';

  const SYSTEM_PROMPTS: Record<Language, string> = {
    zh: "你是一个专业的金融分析师，擅长根据新闻和市场动态对股票进行基本面分析。" +
        "请始终以纯 JSON 文本格式回复（不包含 Markdown 代码块标记或任何额外说明）。",
    en: "You are a professional financial analyst specializing in fundamental analysis of stocks based on news and market dynamics. " +
        "Always reply in plain JSON text format (no Markdown code fences or extra commentary).",
    ja: "あなたはニュースと市場動向に基づいて株式のファンダメンタル分析を専門とするプロの金融アナリストです。" +
        "常に純粋なJSONテキスト形式で返答してください（Markdownコードフェンスや余分なコメントは含めないでください）。",
  };

  export function getSystemPrompt(language: Language = 'zh'): string {
    return SYSTEM_PROMPTS[language];
  }

  /** 向后兼容：SYSTEM_PROMPT 常量保留为 zh 版本（供旧代码过渡期使用） */
  export const SYSTEM_PROMPT = SYSTEM_PROMPTS.zh;

  const ROLE_INSTRUCTIONS: Record<Language, string> = {
    zh: `请作为资深金融分析师，深入分析该股票的近期表现。\n你会收到一组抓取到的最新新闻及正文摘要，请根据这些信息进行客观、深度的研判。`,
    en: `As a senior financial analyst, provide an in-depth analysis of this stock's recent performance.\nYou will receive a set of the latest news articles with content summaries. Provide an objective, thorough assessment based on this information.`,
    ja: `シニア金融アナリストとして、この銘柄の最近のパフォーマンスを詳しく分析してください。\n最新ニュース記事と本文要約のセットを受け取ります。この情報に基づいて客観的で深い評価を提供してください。`,
  };

  const FORMAT_INSTRUCTIONS: Record<Language, string> = {
    zh: `必须返回以下 JSON 格式，且不包含 Markdown 代码块标记（直接输出 JSON 文本）：
  {
    "rating": 1-100 的评分数字 (例如 85),
    "sentiment": "bullish" (看涨), "bearish" (看跌) 或 "neutral" (中性),
    "summary": "分析摘要，请包含新闻中提到的关键事实",
    "pros": ["利多理由"],
    "cons": ["风险提示"],
    "sector": "该股票所属的大板块（例如：信息技术、消费品、工业等）",
    "industry": "具体行业分类（例如：半导体、新能源、白酒等）",
    "description": "基于你的训练知识和新闻，用一句话简要描述该公司的主营业务和市场地位"
  }`,
    en: `Return ONLY the following JSON (no Markdown fences):
  {
    "rating": numeric score 1-100 (e.g. 85),
    "sentiment": "bullish", "bearish", or "neutral",
    "summary": "Analysis summary — include key facts from the news",
    "pros": ["positive factors"],
    "cons": ["risk factors"],
    "sector": "Broad sector (e.g. Technology, Consumer Goods, Industrials)",
    "industry": "Specific industry (e.g. Semiconductors, Renewable Energy, Beverages)",
    "description": "One sentence describing the company's main business and market position based on your knowledge and the news"
  }`,
    ja: `以下のJSONのみを返してください（Markdownフェンスなし）：
  {
    "rating": 1-100の数値スコア（例：85）,
    "sentiment": "bullish"、"bearish"、または"neutral",
    "summary": "分析サマリー。ニュースの重要な事実を含めること",
    "pros": ["ポジティブ要因"],
    "cons": ["リスク要因"],
    "sector": "大分類セクター（例：テクノロジー、消費財、工業）",
    "industry": "具体的な業種（例：半導体、再生可能エネルギー、飲料）",
    "description": "ニュースとあなたの知識に基づいて、会社の主要事業と市場地位を一文で説明"
  }`,
  };

  const NEWS_LABELS: Record<Language, { title: string; source: string; body: string; stock: string; list: string; instruct: string }> = {
    zh: { title: '标题', source: '来源', body: '正文摘要', stock: '股票代码', list: '抓取新闻列表', instruct: '请结合以上信息（特别是新闻正文中的细节）提供一个结构化的分析报告。' },
    en: { title: 'Title', source: 'Source', body: 'Content', stock: 'Ticker', list: 'News articles', instruct: 'Using the above news (especially the article details), provide a structured analysis report.' },
    ja: { title: 'タイトル', source: 'ソース', body: '本文要約', stock: '銘柄', list: 'ニュース記事', instruct: '上記ニュース（特に記事の詳細）を使用して、構造化された分析レポートを提供してください。' },
  };

  export function buildAnalysisPrompt(
    symbol: string,
    news: StockNews[],
    language: Language = 'zh',
    contentLimit = 1000
  ): string {
    const lbl = NEWS_LABELS[language];
    const newsList = news.map((n, i) => {
      let item = `${i + 1}. 【${lbl.title}】: ${n.title}`;
      if (n.source) item += ` (${lbl.source}: ${n.source})`;
      if (n.content && n.content.length > 50) {
        item += `\n   【${lbl.body}】: ${n.content.substring(0, contentLimit)}`;
      }
      return item;
    }).join("\n\n");

    return `${ROLE_INSTRUCTIONS[language]}

  ${lbl.stock}: ${symbol}

  ${lbl.list}:
  ${newsList}

  ${lbl.instruct}

  ${FORMAT_INSTRUCTIONS[language]}`;
  }

  // ---- 量化/估值标签 ----

  interface QuantLabels {
    header: string; technical: string; fundamental: string;
    bullish: string; bearish: string; neutral: string;
    bullish_align: string; bearish_align: string; mixed_align: string;
    oversold: string; overbought: string; neutral_range: string;
    macd_expanding: string; macd_contracting: string;
    adx_strong: string; adx_weak: string;
    ema_align: string; rsi: string; macd: string; adx: string; vol: string; vol_vs: string;
    composite: string;
    low_risk: string; medium_risk: string; high_risk: string;
    risk_level: string; vol_annual: string; max_dd: string; sharpe: string;
  }

  const QUANT_LABELS: Record<Language, QuantLabels> = {
    zh: {
      header: '[量化分析摘要]', technical: '技术面信号', fundamental: '基本面信号',
      bullish: '看涨', bearish: '看跌', neutral: '中性',
      bullish_align: '多头排列', bearish_align: '空头排列', mixed_align: '交叉纠缠',
      oversold: '（超卖）', overbought: '（超买）', neutral_range: '（中性区间）',
      macd_expanding: '放大', macd_contracting: '收缩',
      adx_strong: '（趋势明确）', adx_weak: '（趋势较弱）',
      ema_align: 'EMA 排列', rsi: 'RSI(14)', macd: 'MACD', adx: 'ADX',
      vol: '成交量比', vol_vs: '（相对20日均量）',
      composite: '综合量化评分',
      low_risk: '低风险', medium_risk: '中风险', high_risk: '高风险',
      risk_level: '风险等级', vol_annual: '年化波动率', max_dd: '最大回撤', sharpe: '夏普比率',
    },
    en: {
      header: '[Quantitative Analysis Summary]', technical: 'Technical Signal', fundamental: 'Fundamental Signal',
      bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral',
      bullish_align: 'Bullish alignment', bearish_align: 'Bearish alignment', mixed_align: 'Tangled',
      oversold: ' (Oversold)', overbought: ' (Overbought)', neutral_range: ' (Neutral zone)',
      macd_expanding: 'expanding', macd_contracting: 'contracting',
      adx_strong: ' (Strong trend)', adx_weak: ' (Weak trend)',
      ema_align: 'EMA alignment', rsi: 'RSI(14)', macd: 'MACD histogram', adx: 'ADX',
      vol: 'Volume ratio', vol_vs: ' (vs 20-day avg)',
      composite: 'Composite quant score',
      low_risk: 'Low', medium_risk: 'Medium', high_risk: 'High',
      risk_level: 'Risk Level', vol_annual: 'Annualized volatility', max_dd: 'Max drawdown', sharpe: 'Sharpe ratio',
    },
    ja: {
      header: '[定量分析サマリー]', technical: 'テクニカルシグナル', fundamental: 'ファンダメンタルシグナル',
      bullish: '強気', bearish: '弱気', neutral: '中立',
      bullish_align: '強気配列', bearish_align: '弱気配列', mixed_align: '交錯',
      oversold: '（売られ過ぎ）', overbought: '（買われ過ぎ）', neutral_range: '（中立ゾーン）',
      macd_expanding: '拡大中', macd_contracting: '縮小中',
      adx_strong: '（トレンド明確）', adx_weak: '（トレンド弱い）',
      ema_align: 'EMA配列', rsi: 'RSI(14)', macd: 'MACDヒストグラム', adx: 'ADX',
      vol: '出来高比率', vol_vs: '（20日平均比）',
      composite: '総合クオンツスコア',
      low_risk: '低', medium_risk: '中', high_risk: '高',
      risk_level: 'リスクレベル', vol_annual: '年率ボラティリティ', max_dd: '最大ドローダウン', sharpe: 'シャープレシオ',
    },
  };

  interface ValuationLabels {
    header: string; intrinsic: string; market_cap: string; margin: string;
    signal: string; undervalued: string; overvalued: string; fair: string;
    dcf_wacc: string; bear: string; base: string; bull: string;
    relative: string; owner_earnings: string;
  }

  const VALUATION_LABELS: Record<Language, ValuationLabels> = {
    zh: {
      header: '[估值分析]', intrinsic: '内在价值估算', market_cap: '当前市值',
      margin: '安全边际', signal: '估值信号',
      undervalued: '低估', overvalued: '高估', fair: '合理',
      dcf_wacc: 'DCF (WACC', bear: '悲观', base: '基准', bull: '乐观',
      relative: '相对估值', owner_earnings: 'Owner Earnings',
    },
    en: {
      header: '[Valuation Analysis]', intrinsic: 'Intrinsic value estimate', market_cap: 'Current market cap',
      margin: 'Margin of safety', signal: 'Valuation signal',
      undervalued: 'Undervalued', overvalued: 'Overvalued', fair: 'Fair value',
      dcf_wacc: 'DCF (WACC', bear: 'bear', base: 'base', bull: 'bull',
      relative: 'Relative valuation', owner_earnings: 'Owner Earnings',
    },
    ja: {
      header: '[バリュエーション分析]', intrinsic: '内在価値推定', market_cap: '現在の時価総額',
      margin: '安全マージン', signal: 'バリュエーションシグナル',
      undervalued: '割安', overvalued: '割高', fair: '適正',
      dcf_wacc: 'DCF (WACC', bear: '悲観', base: '基準', bull: '楽観',
      relative: '相対バリュエーション', owner_earnings: 'オーナー利益',
    },
  };

  function translateSignal(signal: string, lbl: QuantLabels): string {
    if (signal === 'bullish') return lbl.bullish;
    if (signal === 'bearish') return lbl.bearish;
    return lbl.neutral;
  }

  function formatQuantSummary(quant: QuantBundle, language: Language): string {
    const lbl = QUANT_LABELS[language];
    const t = quant.technical;
    const f = quant.fundamental;
    const td = t.details;
    const fd = f.details;

    const lines: string[] = [lbl.header, '', `${lbl.technical}：${translateSignal(t.signal, lbl)}，置信度 ${t.confidence}%`];

    if (td.alignment != null) lines.push(`- ${lbl.ema_align}：${td.alignment === 'bullish' ? lbl.bullish_align : td.alignment === 'bearish' ? lbl.bearish_align : lbl.mixed_align}`);
    if (td.rsi != null) lines.push(`- ${lbl.rsi}：${td.rsi}${Number(td.rsi) < 30 ? lbl.oversold : Number(td.rsi) > 70 ? lbl.overbought : lbl.neutral_range}`);
    if (td.macd_trend != null) lines.push(`- ${lbl.macd}：${td.macd_trend === 'expanding' ? lbl.macd_expanding : lbl.macd_contracting}`);
    if (td.adx != null) lines.push(`- ${lbl.adx}：${td.adx}${Number(td.adx) > 25 ? lbl.adx_strong : lbl.adx_weak}`);
    if (td.volume_ratio != null) lines.push(`- ${lbl.vol}：${td.volume_ratio}${lbl.vol_vs}`);

    lines.push('', `${lbl.fundamental}：${translateSignal(f.signal, lbl)}，置信度 ${f.confidence}%`);

    if (fd.roe != null) lines.push(`- ROE: ${fd.roe}%`);
    if (fd.net_margin != null) lines.push(`- Net margin: ${fd.net_margin}%`);
    if (fd.revenue_growth != null) lines.push(`- Revenue growth: ${fd.revenue_growth}%`);
    if (fd.pe != null) lines.push(`- PE: ${fd.pe}`);
    if (fd.pb != null) lines.push(`- PB: ${fd.pb}`);
    if (fd.debt_to_asset != null) lines.push(`- Debt/asset: ${fd.debt_to_asset}%`);

    lines.push('', `${lbl.composite}：${quant.composite.score}/100（${translateSignal(quant.composite.signal, lbl)}）`);

    if (quant.risk) {
      const r = quant.risk;
      const riskLabel = r.riskLevel === 'low' ? lbl.low_risk : r.riskLevel === 'high' ? lbl.high_risk : lbl.medium_risk;
      lines.push('', `${lbl.risk_level}：${riskLabel}`);
      lines.push(`- ${lbl.vol_annual}: ${(r.annualizedVolatility * 100).toFixed(1)}%`);
      lines.push(`- ${lbl.max_dd}: ${(r.maxDrawdown * 100).toFixed(1)}%`);
      lines.push(`- ${lbl.sharpe}: ${r.sharpeProxy}`);
    }

    return lines.join('\n');
  }

  function formatValuationSummary(quant: QuantBundle, language: Language): string | null {
    const v = quant.valuation;
    if (!v) return null;
    const lbl = VALUATION_LABELS[language];

    const lines: string[] = [lbl.header, ''];
    if (v.intrinsicValue != null) lines.push(`${lbl.intrinsic}: ${(v.intrinsicValue / 1e8).toFixed(0)}亿`);
    if (v.marketCap != null) lines.push(`${lbl.market_cap}: ${(v.marketCap / 1e8).toFixed(0)}亿`);
    if (v.marginOfSafety != null) {
      const pct = (v.marginOfSafety * 100).toFixed(1);
      lines.push(`${lbl.margin}: ${v.marginOfSafety > 0 ? '+' : ''}${pct}%`);
    }
    const sigLabel = v.signal === 'undervalued' ? lbl.undervalued : v.signal === 'overvalued' ? lbl.overvalued : lbl.fair;
    lines.push(`${lbl.signal}: ${sigLabel}`);

    if (v.models.ownerEarnings) lines.push(`- ${lbl.owner_earnings}: ${v.models.ownerEarnings.details}`);
    if (v.models.dcf) {
      lines.push(`- ${lbl.dcf_wacc} ${(v.models.dcf.wacc * 100).toFixed(1)}%): ${lbl.bear} ${(v.models.dcf.bear / 1e8).toFixed(0)}亿 / ${lbl.base} ${(v.models.dcf.base / 1e8).toFixed(0)}亿 / ${lbl.bull} ${(v.models.dcf.bull / 1e8).toFixed(0)}亿`);
    }
    if (v.models.relative) lines.push(`- ${lbl.relative}: ${v.models.relative.details}`);

    return lines.join('\n');
  }

  const ENHANCED_SUFFIX: Record<Language, string> = {
    zh: `\n\n请结合量化分析数据和新闻信息，给出综合研判。在 JSON 中额外增加两个字段：\n"technicalView": "对技术面指标的文字解读（1-2 句话）",\n"fundamentalView": "对基本面指标的文字解读（1-2 句话）"`,
    en: `\n\nCombine the quantitative data and news for a comprehensive assessment. Add two extra fields to the JSON:\n"technicalView": "Brief interpretation of technical indicators (1-2 sentences)",\n"fundamentalView": "Brief interpretation of fundamental indicators (1-2 sentences)"`,
    ja: `\n\n量的データとニュースを組み合わせて総合評価を行ってください。JSONに以下の2つのフィールドを追加してください：\n"technicalView": "テクニカル指標の簡潔な解釈（1-2文）",\n"fundamentalView": "ファンダメンタル指標の簡潔な解釈（1-2文）"`,
  };

  export function buildEnhancedPrompt(
    symbol: string,
    news: StockNews[],
    quant: QuantBundle,
    language: Language = 'zh',
    contentLimit = 1000,
  ): string {
    const quantSection = formatQuantSummary(quant, language);
    const valuationSection = formatValuationSummary(quant, language);
    const newsPrompt = buildAnalysisPrompt(symbol, news, language, contentLimit);

    const sections = [quantSection];
    if (valuationSection) sections.push(valuationSection);
    sections.push(newsPrompt);

    return `${sections.join('\n\n')}${ENHANCED_SUFFIX[language]}`;
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  Run: `cd sidecar && bun test prompts.test.ts`
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add sidecar/prompts.ts sidecar/prompts.test.ts
  git commit -m "feat(i18n): multilingual prompts with zh/en/ja variants"
  ```

---

## Task 6: Update AI provider interface and implementations

**Files:**
- Modify: `sidecar/ai.ts`
- Modify: `sidecar/providers/openai.ts`
- Modify: `sidecar/providers/anthropic.ts`
- Modify: `sidecar/providers/ollama.ts`
- Modify: `sidecar/analysis.ts`

- [ ] **Step 1: Update `sidecar/ai.ts`**

  Add `Language` import and update `analyze` signature:

  ```ts
  import type { AIAnalysisResult, StockNews, QuantBundle, Language } from '../shared/types';

  export type ProviderKind = 'openai' | 'ollama' | 'anthropic';

  export interface AIProvider {
    readonly kind: ProviderKind;
    analyze(symbol: string, news: StockNews[], quant?: QuantBundle, language?: Language): Promise<AIAnalysisResult>;
  }
  ```

- [ ] **Step 2: Update `sidecar/providers/openai.ts`**

  Change the import and `analyze` method:

  ```ts
  import { buildAnalysisPrompt, buildEnhancedPrompt, getSystemPrompt } from "../prompts";
  import type { Language } from "../../shared/types";
  ```

  Update `analyze`:

  ```ts
  async analyze(symbol: string, news: StockNews[], quant?: QuantBundle, language?: Language): Promise<AIAnalysisResult> {
    const lang = language ?? 'zh';
    const prompt = quant
      ? buildEnhancedPrompt(symbol, news, quant, lang, PROVIDER_PROFILES.openai.contentLimit)
      : buildAnalysisPrompt(symbol, news, lang, PROVIDER_PROFILES.openai.contentLimit);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: getSystemPrompt(lang) },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }, { timeout: PROVIDER_PROFILES.openai.timeout });

      if (!response.choices?.length) {
        throw new Error('OpenAI 返回了空的 choices 列表，无法提取分析结果');
      }
      const content = response.choices[0].message.content || "{}";
      return parseJsonFromAi<AIAnalysisResult>(content);
    } catch (error) {
      logger.error(`OpenAI 分析出错: ${toErrorMessage(error)}`);
      throw new Error(`OpenAI 分析失败: ${toErrorMessage(error)}`);
    }
  }
  ```

- [ ] **Step 3: Update `sidecar/providers/anthropic.ts`**

  Replace `SYSTEM_PROMPT` import and add `language` param. Anthropic uses a top-level `system:` field (not a messages entry):

  ```ts
  import { buildAnalysisPrompt, buildEnhancedPrompt, getSystemPrompt } from "../prompts";
  import type { Language } from "../../shared/types";
  import type { AIAnalysisResult, StockNews, QuantBundle } from "../../shared/types";

  async analyze(symbol: string, news: StockNews[], quant?: QuantBundle, language?: Language): Promise<AIAnalysisResult> {
    const lang = language ?? 'zh';
    const prompt = quant
      ? buildEnhancedPrompt(symbol, news, quant, lang, PROVIDER_PROFILES.anthropic.contentLimit)
      : buildAnalysisPrompt(symbol, news, lang, PROVIDER_PROFILES.anthropic.contentLimit);

    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: getSystemPrompt(lang),      // ← was SYSTEM_PROMPT
          messages: [{ role: "user", content: prompt }],
        }),
        PROVIDER_PROFILES.anthropic.timeout,
        "Anthropic 请求超时"
      );
      // ... rest unchanged
    }
  }
  ```

- [ ] **Step 4: Update `sidecar/providers/ollama.ts`**

  Same pattern as openai.ts and anthropic.ts:

  ```ts
  import { buildAnalysisPrompt, buildEnhancedPrompt, getSystemPrompt } from "../prompts";
  import type { Language } from "../../shared/types";

  async analyze(symbol: string, news: StockNews[], quant?: QuantBundle, language?: Language): Promise<AIAnalysisResult> {
    const lang = language ?? 'zh';
    const prompt = quant
      ? buildEnhancedPrompt(symbol, news, quant, lang, PROVIDER_PROFILES.ollama.contentLimit)
      : buildAnalysisPrompt(symbol, news, lang, PROVIDER_PROFILES.ollama.contentLimit);

    // In messages: { role: "system", content: getSystemPrompt(lang) },
  }
  ```

- [ ] **Step 5: Update `sidecar/analysis.ts`**

  Add `language?` to config type in `analyzeNewsWithLLM` and pass to `provider.analyze`:

  ```ts
  import type { Language } from '../shared/types';

  export async function analyzeNewsWithLLM(
    symbol: string,
    news: StockNews[],
    providerType: string = 'openai',
    config: { apiKey?: string; baseUrl?: string; model?: string; language?: Language } = {},
    quant?: QuantBundle,
    deps: AnalysisDeps = {},
  ): Promise<AIAnalysisResult> {
    const createProvider = deps.createProvider ?? realCreateProvider;
    try {
      const provider = createProvider(providerType, config);
      return await provider.analyze(symbol, news, quant, config.language);
    } catch (error) {
      // ... (fallback unchanged)
    }
  }
  ```

  Also update `performFullAnalysis` config type:

  ```ts
  export async function performFullAnalysis(
    symbol: string,
    providerType: string = 'openai',
    config: { apiKey?: string; baseUrl?: string; model?: string; deepMode?: boolean; language?: Language } = {},
    deps: AnalysisDeps = {},
  ): Promise<FullAnalysisResponse> {
    const bundle = await fetchMarketBundle(symbol, config.deepMode ?? true, deps);
    const analysis = await analyzeNewsWithLLM(symbol, bundle.news, providerType, config, undefined, deps);
    return { symbol, stockInfo: bundle.stockInfo, news: bundle.news, analysis };
  }
  ```

- [ ] **Step 6: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 7: Commit**

  ```bash
  git add sidecar/ai.ts sidecar/providers/openai.ts sidecar/providers/anthropic.ts sidecar/providers/ollama.ts sidecar/analysis.ts
  git commit -m "feat(i18n): thread language through AI provider chain"
  ```

---

## Task 7: Update agent system for language

**Files:**
- Modify: `sidecar/agents/types.ts`
- Modify: `sidecar/agents/masters/factory.ts`
- Modify: `sidecar/agents/synthesizer.ts`
- Modify: `sidecar/agents/sentiment.ts`
- Modify: `sidecar/deep-analysis.ts`

- [ ] **Step 1: Add `language?` to `MasterAnalysisContext` in `agents/types.ts`**

  ```ts
  import type { QuantBundle, StockNews, MasterMeta, MasterSignal, Language } from '../../shared/types';

  export interface MasterAnalysisContext {
    symbol: string;
    quant: QuantBundle;
    news: StockNews[];
    chat: ChatProvider;
    language?: Language;
  }
  ```

- [ ] **Step 2: Update `agents/masters/factory.ts` to inject language instruction**

  The key strategy: each master agent's `SYSTEM_PROMPT` ends with `"用中文回复。推理控制在 200 字以内。只返回 JSON：..."`. We replace `"用中文回复"` with the language-appropriate instruction at runtime. No master files need to change.

  ```ts
  import type { Language } from '../../../shared/types';

  const LANG_INSTRUCTION: Record<Language, string> = {
    zh: '用中文回复',
    en: 'Respond in English',
    ja: '日本語で回答してください',
  };

  export function createMasterAgent(
    meta: MasterMeta,
    systemPrompt: string,
    buildUserPrompt: (ctx: MasterAnalysisContext) => string,
  ): MasterAgent {
    return {
      meta,
      async analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
        const lang = ctx.language ?? 'zh';
        const localizedPrompt = systemPrompt.replace('用中文回复', LANG_INSTRUCTION[lang]);
        try {
          const raw = await ctx.chat.chat(localizedPrompt, buildUserPrompt(ctx));
          return parseResponse(raw, meta.id);
        } catch (err) {
          logger.warn(`[${meta.id}] 分析失败: ${toErrorMessage(err)}`);
          return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: '分析服务暂不可用' };
        }
      },
    };
  }
  ```

- [ ] **Step 3: Update `agents/synthesizer.ts`**

  Add `language?` parameter to `synthesize` and make the system prompt language-aware:

  ```ts
  import type { Language } from '../../shared/types';

  const SYSTEM_PROMPTS: Record<Language, string> = {
    zh: `你是投资委员会主席。综合所有分析师的独立研判，给出最终投资建议。
  重点关注：多数分析师的共识方向、高置信度分析师的权重更大、不同风格间的分歧。
  用中文回复。只返回 JSON：
  {"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内综合分析", "consensus": 0-100}`,
    en: `You are the chair of the investment committee. Synthesize all analysts' independent assessments into a final recommendation.
  Focus on: the consensus direction, weight high-confidence analysts more heavily, and note divergences between styles.
  Respond in English. Return only JSON:
  {"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "Summary in under 200 words", "consensus": 0-100}`,
    ja: `あなたは投資委員会の議長です。全アナリストの独立した評価を総合して最終推奨を提示してください。
  重視すること：多数決の方向性、高い確信度のアナリストへの重み付け、スタイル間の乖離。
  日本語で回答してください。JSONのみを返してください：
  {"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内の総合分析", "consensus": 0-100}`,
  };

  export async function synthesize(
    masterSignals: MasterSignal[], sentiment: SentimentSignal, quant: QuantBundle, chat: ChatProvider,
    language?: Language,
  ): Promise<DeepAnalysisResult> {
    const lang = language ?? 'zh';
    const consensus = computeConsensus(masterSignals);
    const localSynthesis = computeLocalSynthesis(masterSignals);
    let synthesis: DeepAnalysisResult['synthesis'];
    try {
      const raw = await chat.chat(SYSTEM_PROMPTS[lang], buildSynthesisPrompt(masterSignals, sentiment, quant));
      // ... (rest unchanged)
    }
    // ...
  }
  ```

- [ ] **Step 4: Update `agents/sentiment.ts`**

  Make `analyzeSentiment` accept an optional `language` parameter:

  ```ts
  import type { Language } from '../../shared/types';

  const SYSTEM_PROMPTS: Record<Language, string> = {
    zh: `你是金融新闻情绪分析专家。对每条新闻标注情绪倾向并给出整体判断。只返回 JSON。`,
    en: `You are a financial news sentiment analysis expert. Label the sentiment of each news item and give an overall judgment. Return only JSON.`,
    ja: `あなたは金融ニュースの感情分析の専門家です。各ニュースの感情傾向にラベルを付け、全体的な判断を示してください。JSONのみを返してください。`,
  };

  export async function analyzeSentiment(news: StockNews[], chat: ChatProvider, language?: Language): Promise<SentimentSignal> {
    const lang = language ?? 'zh';
    if (news.length === 0) return { signal: 'neutral', confidence: 50, newsBreakdown: { positive: 0, negative: 0, neutral: 0, total: 0 } };
    try {
      const raw = await chat.chat(SYSTEM_PROMPTS[lang], buildPrompt(news));
      // ... (rest unchanged)
    }
  }
  ```

- [ ] **Step 5: Update `sidecar/deep-analysis.ts`**

  Add `language?` to `DeepAnalysisOptions` and thread it through:

  ```ts
  import type { Language } from '../shared/types';

  export interface DeepAnalysisOptions {
    symbol: string;
    quant: QuantBundle;
    news: StockNews[];
    chat: ChatProvider;
    selectedMasters?: string[];
    language?: Language;
  }

  export async function runDeepAnalysis(opts: DeepAnalysisOptions): Promise<DeepAnalysisResult> {
    const { symbol, quant, news, chat, selectedMasters = DEFAULT_MASTER_IDS, language } = opts;
    // ...
    const ctx: MasterAnalysisContext = { symbol, quant, news, chat, language };

    const masterTasks = masters.map((m: MasterAgent) => () => m.analyze(ctx));
    const [masterResults, sentimentResult] = await Promise.all([
      runWithConcurrency<MasterSignal>(masterTasks, MAX_CONCURRENCY),
      analyzeSentiment(news, chat, language),
    ]);

    return synthesize(masterResults, sentimentResult, quant, chat, language);
  }
  ```

- [ ] **Step 6: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 7: Commit**

  ```bash
  git add sidecar/agents/types.ts sidecar/agents/masters/factory.ts sidecar/agents/synthesizer.ts sidecar/agents/sentiment.ts sidecar/deep-analysis.ts
  git commit -m "feat(i18n): thread language through agent system"
  ```

---

## Task 8: Update `cli-handlers.ts` to pass language

**Files:**
- Modify: `sidecar/cli-handlers.ts`

- [ ] **Step 1: Update `handleAnalysis` call (line ~156)**

  Add `language: config.language` to the config object:

  ```ts
  const result = await analyze(symbol, config.provider, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.modelName,
    deepMode: config.deepMode,
    language: config.language,
  });
  ```

- [ ] **Step 2: Update `handleAnalyzeOnly` call (line ~196)**

  ```ts
  const analysis = await analyzeOnly(symbol, news, config.provider, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.modelName,
    language: config.language,
  }, quant);
  ```

- [ ] **Step 3: Update `handleDeepAnalysis` call (line ~268)**

  ```ts
  const result = await runDeepAnalysis({
    symbol,
    quant,
    news,
    chat,
    selectedMasters: config.selectedMasters,
    language: config.language,
  });
  ```

- [ ] **Step 4: Run sidecar tests**

  Run: `cd sidecar && bun test`
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add sidecar/cli-handlers.ts
  git commit -m "feat(i18n): pass language from config through CLI handlers"
  ```

---

## Task 9: Update UI components — SettingsModal, SearchHeader, AnalysisPanel

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SearchHeader.tsx`
- Modify: `src/components/AnalysisPanel.tsx`

- [ ] **Step 1: Update `SettingsModal.tsx`**

  Add `useLanguage` import and replace hardcoded strings:

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    // ...

    // Replace tab labels array:
    { id: "general", label: t('tab_general'), icon: User },
    { id: "providers", label: t('tab_providers'), icon: Bot },
    { id: "masters", label: t('tab_masters'), icon: BrainCircuit },

    // Replace sidebar title:
    <span className="font-bold text-gray-100">{t('settings_title')}</span>

    // Replace header title (the object lookup):
    {{ general: t('title_general'), providers: t('title_providers'), masters: t('title_masters') }[activeTab]}

    // Replace status messages:
    {saveStatus === "saving" && (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        {t('saving')}
      </div>
    )}
    {saveStatus === "saved" && (
      <div className="flex items-center gap-2 text-xs text-emerald-500 animate-in fade-in">
        <CheckCircle2 className="w-4 h-4" />
        {t('saved')}
      </div>
    )}

    // Replace buttons:
    <button onClick={onClose} ...>{t('close')}</button>
    <button onClick={handleSave} ...>
      <Save className="w-4 h-4" />
      {t('save_changes')}
    </button>
  ```

- [ ] **Step 2: Update `SearchHeader.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  const SearchHeader: React.FC<SearchHeaderProps> = ({ ... }) => {
    const { t } = useLanguage();
    // ...

    // placeholder:
    placeholder={t('search_placeholder')}

    // analyze button:
    {loading ? t('analyzing') : t('start_analysis')}
  ```

- [ ] **Step 3: Update `AnalysisPanel.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  // inside component:
  const { t } = useLanguage();

  // pros label:
  <TrendingUp className="w-3 h-3" />{t('pros')}

  // cons label:
  <TrendingDown className="w-3 h-3" />{t('cons')}

  // deep analysis button:
  {deepAnalyzing ? t('deep_analyzing') : t('deep_analysis')}

  // technicalView/fundamentalView labels:
  <div className="text-xs text-sky-400 mb-1 font-bold">{t('technical_view')}</div>
  <div className="text-xs text-violet-400 mb-1 font-bold">{t('fundamental_view')}</div>
  ```

- [ ] **Step 4: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/SettingsModal.tsx src/components/SearchHeader.tsx src/components/AnalysisPanel.tsx
  git commit -m "feat(i18n): translate SettingsModal, SearchHeader, AnalysisPanel"
  ```

---

## Task 10: Update UI components — QuantScoreCard, SentimentBar, RiskCard, ValuationCard

**Files:**
- Modify: `src/components/QuantScoreCard.tsx`
- Modify: `src/components/SentimentBar.tsx`
- Modify: `src/components/RiskCard.tsx`
- Modify: `src/components/ValuationCard.tsx`

- [ ] **Step 1: Update `QuantScoreCard.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  // inside component:
  const { t } = useLanguage();

  // Replace SIGNAL_MAP labels (currently hardcoded as a module-level const):
  // Move the labels inside the component so they use `t()`:
  const SIGNAL_MAP = {
    bullish: { label: t('bullish'), color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: TrendingUp },
    bearish: { label: t('bearish'), color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', Icon: TrendingDown },
    neutral: { label: t('neutral'), color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', Icon: Minus },
  };

  // Replace dimension title attributes:
  title={t('technical')}
  title={t('fundamental')}
  ```

- [ ] **Step 2: Update `SentimentBar.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  const SentimentBar: React.FC<SentimentBarProps> = ({ bullish, bearish }) => {
    const { t } = useLanguage();
    return (
      <div ...>
        <span className="text-emerald-500 font-bold">{t('bullish')} {bullish}%</span>
        <span className="text-rose-500 font-bold">{t('bearish')} {bearish}%</span>
      </div>
    );
  };
  ```

- [ ] **Step 3: Update `RiskCard.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  // inside component:
  const { t } = useLanguage();

  // Replace getRiskInfo (move inside component):
  function getRiskInfo(level: string) {
    if (level === 'low') return { label: t('low_risk'), className: 'text-emerald-400' };
    if (level === 'high') return { label: t('high_risk'), className: 'text-rose-400' };
    return { label: t('medium_risk'), className: 'text-amber-400' };
  }

  // Replace section heading:
  <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">{t('risk_assessment')}</h2>
  ```

- [ ] **Step 4: Update `ValuationCard.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  // inside component:
  const { t } = useLanguage();

  // Replace heading:
  <h2 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-widest">{t('valuation_analysis')}</h2>
  ```

- [ ] **Step 5: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/QuantScoreCard.tsx src/components/SentimentBar.tsx src/components/RiskCard.tsx src/components/ValuationCard.tsx
  git commit -m "feat(i18n): translate QuantScoreCard, SentimentBar, RiskCard, ValuationCard"
  ```

---

## Task 11: Update UI components — Watchlist, HistoryTimeline, SentimentBreakdown

**Files:**
- Modify: `src/components/Watchlist.tsx`
- Modify: `src/components/AnalysisHistory/HistoryTimeline.tsx`
- Modify: `src/components/DeepAnalysis/SentimentBreakdown.tsx`

- [ ] **Step 1: Update `Watchlist.tsx`**

  ```tsx
  import { useLanguage } from "../hooks/useLanguage";

  // inside component:
  const { t } = useLanguage();

  // Replace empty state:
  <p className="text-gray-600 text-xs text-center pt-4">{t('no_watchlist')}</p>
  ```

- [ ] **Step 2: Update `HistoryTimeline.tsx`**

  ```tsx
  import { useLanguage } from "../../hooks/useLanguage";
  import type { Language } from "../../hooks/useLanguage";

  // Replace module-level TYPE_LABELS const with a function that takes t():
  function getTypeLabels(t: ReturnType<typeof useLanguage>['t']) {
    return {
      ai:       { text: t('type_ai'),       color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      deep:     { text: t('type_deep'),     color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
      quant:    { text: t('type_quant'),    color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
      backtest: { text: t('type_backtest'), color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
      screener: { text: t('type_screener'), color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
    };
  }

  // Make formatRelativeTime language-aware:
  const LOCALE_MAP: Record<Language, string> = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' };

  function formatRelativeTime(ms: number, t: ReturnType<typeof useLanguage>['t'], locale: string): string {
    const diff = Date.now() - ms;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return t('just_now');
    if (minutes < 60) return t('minutes_ago', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('hours_ago', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('days_ago', { n: days });
    return new Date(ms).toLocaleDateString(locale);
  }

  // inside HistoryTimeline component:
  const { t, language } = useLanguage();
  const TYPE_LABELS = getTypeLabels(t);
  const locale = LOCALE_MAP[language];

  // Replace no-history message:
  <p className="text-xs text-gray-500 text-center py-8">{t('no_history')}</p>

  // Update formatRelativeTime call:
  formatRelativeTime(record.analyzedAt, t, locale)
  ```

- [ ] **Step 3: Update `DeepAnalysis/SentimentBreakdown.tsx`**

  ```tsx
  import { useLanguage } from "../../hooks/useLanguage";

  const SentimentBreakdown: React.FC<SentimentBreakdownProps> = ({ sentiment }) => {
    const { t } = useLanguage();
    const { positive, negative, neutral, total } = sentiment.newsBreakdown;
    // ...

    return (
      <div ...>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">{t('news_sentiment')}</span>
          <span className="text-gray-500">{t('news_count', { n: total })}</span>
        </div>
        {/* ... bar ... */}
        <div className="flex justify-between text-[10px] text-gray-500">
          <span className="text-emerald-400">{t('sentiment_positive', { n: positive })}</span>
          <span>{t('sentiment_neutral_label', { n: neutral })}</span>
          <span className="text-rose-400">{t('sentiment_negative', { n: negative })}</span>
        </div>
      </div>
    );
  };
  ```

- [ ] **Step 4: Run full test suite**

  Run: `bun run test`
  Expected: all tests PASS

- [ ] **Step 5: Run typecheck**

  Run: `bunx tsc --noEmit`
  Expected: no errors

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/Watchlist.tsx src/components/AnalysisHistory/HistoryTimeline.tsx src/components/DeepAnalysis/SentimentBreakdown.tsx
  git commit -m "feat(i18n): translate Watchlist, HistoryTimeline, SentimentBreakdown"
  ```

- [ ] **Step 7: Push to remote**

  Run: `git push`
  Expected: pre-push hooks pass (tsc + cargo check), push succeeds
