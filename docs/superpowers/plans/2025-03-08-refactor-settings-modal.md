# Refactor SettingsModal (Split provider forms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce cognitive load of `SettingsModal.tsx` by splitting complex provider configuration logic into independent sub-components.

**Architecture:** Extract form segments into `src/components/settings/` and simplify the main modal component.

**Tech Stack:** React, TypeScript, Lucide React, Tailwind CSS.

---

### Task 1: Initialize Directory

**Files:**
- Create: `src/components/settings/.gitkeep` (temporary)

- [ ] **Step 1: Create the directory**
Run: `mkdir -p src/components/settings/`

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/
git commit -m "chore: create settings components directory"
```

### Task 2: Create OpenAIForm Component

**Files:**
- Create: `src/components/settings/OpenAIForm.tsx`

- [ ] **Step 1: Create OpenAIForm.tsx**
```tsx
import React from "react";
import { Key, Globe, Cpu } from "lucide-react";
import { Settings } from "../../hooks/useSettings";

interface OpenAIFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * OpenAI 配置表单组件
 */
export const OpenAIForm: React.FC<OpenAIFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* API Key */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
            <Key className="w-3 h-3" /> API Key
          </label>
          <span className="text-[10px] text-gray-600">本地加密存储</span>
        </div>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
        />
      </div>

      {/* Base URL */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> 接口地址 (Endpoint)
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>

      {/* Model Name */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Cpu className="w-3 h-3" /> 模型名称
        </label>
        <input
          type="text"
          value={settings.ollamaModel}
          onChange={(e) => onChange({ ollamaModel: e.target.value })}
          placeholder="gpt-4o..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/OpenAIForm.tsx
git commit -m "feat: add OpenAIForm component"
```

### Task 3: Create OllamaForm Component

**Files:**
- Create: `src/components/settings/OllamaForm.tsx`

- [ ] **Step 1: Create OllamaForm.tsx**
```tsx
import React from "react";
import { Globe, Cpu } from "lucide-react";
import { Settings } from "../../hooks/useSettings";

interface OllamaFormProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

/**
 * Ollama 配置表单组件
 */
export const OllamaForm: React.FC<OllamaFormProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Base URL */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> 接口地址 (Endpoint)
        </label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434"
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>

      {/* Model Name */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
          <Cpu className="w-3 h-3" /> 模型名称
        </label>
        <input
          type="text"
          value={settings.ollamaModel}
          onChange={(e) => onChange({ ollamaModel: e.target.value })}
          placeholder="llama3, qwen2..."
          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/OllamaForm.tsx
git commit -m "feat: add OllamaForm component"
```

### Task 4: Create GeneralForm Component

**Files:**
- Create: `src/components/settings/GeneralForm.tsx`

- [ ] **Step 1: Create GeneralForm.tsx**
```tsx
import React from "react";

/**
 * 常规设置表单组件（目前包含占位开关）
 */
export const GeneralForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">自动分析</span>
          <span className="setting-desc text-gray-500 text-xs">点击关注列表时自动开始分析</span>
        </div>
        <div className="w-10 h-5 bg-emerald-500/20 rounded-full relative cursor-pointer">
          <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-emerald-500 rounded-full shadow-sm" />
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">深度模式</span>
          <span className="setting-desc text-gray-500 text-xs">分析时提取新闻全文，耗时较长但准确度更高</span>
        </div>
        <div className="w-10 h-5 bg-gray-800 rounded-full relative cursor-pointer">
          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-500 rounded-full shadow-sm" />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/GeneralForm.tsx
git commit -m "feat: add GeneralForm component"
```

### Task 5: Simplify SettingsModal.tsx

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Import new components and update rendering logic**
Replace the inline forms with the new components.

- [ ] **Step 2: Verify types**
Run: `npm run build`

- [ ] **Step 3: Commit**
```bash
git add src/components/SettingsModal.tsx
git commit -m "refactor: use separate provider forms in SettingsModal"
```

### Task 4: Final Verification

- [ ] **Step 1: Final build check**
Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 2: Push changes**
Run: `git push origin HEAD`
