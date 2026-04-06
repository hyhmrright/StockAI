# Task 2: UI 基础与仪表盘布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 StockAI 的主仪表盘布局，包括全局样式、搜索栏和三栏式面板布局。

**Architecture:** 使用 Tailwind CSS 进行样式管理，创建一个 `Dashboard` 组件来实现响应式三栏布局。全局背景和面板颜色将从 `tailwind.config.js` 中定义的自定义颜色中获取。

**Tech Stack:** React (TypeScript), Tailwind CSS.

---

### Task 1: 编写基础全局样式

**Files:**
- Create: `src/index.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: 创建 `src/index.css` 并添加 Tailwind 指令**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 这里的 bg-background 和 text-white 必须与 tailwind.config.js 匹配 */
body {
  @apply bg-background text-white antialiased overflow-hidden m-0 p-0;
  min-height: 100vh;
}
```

- [ ] **Step 2: 在 `src/main.tsx` 中导入 `index.css`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // 确保导入全局样式

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: 提交更改**

```bash
git add src/index.css src/main.tsx
git commit -m "feat: add global styles and tailwind directives"
```

### Task 2: 实现主布局组件 (Dashboard Layout)

**Files:**
- Create: `src/components/Dashboard.tsx`

- [ ] **Step 1: 创建 `src/components` 目录**

Run: `mkdir -p src/components`

- [ ] **Step 2: 创建 `src/components/Dashboard.tsx` 并实现布局**

```tsx
import React from 'react';

/**
 * Dashboard 组件实现了主仪表盘布局
 * 包含顶部的搜索栏和下方的三栏式主内容区
 */
const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-screen bg-background">
      {/* 顶部搜索栏 */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 bg-panel">
        <div className="flex items-center w-full max-w-2xl">
          <input
            type="text"
            placeholder="搜索股票代码 (例如: AAPL, TSLA)..."
            className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </header>

      {/* 下方主体：三栏布局 */}
      <main className="flex flex-1 overflow-hidden">
        {/* 左侧栏 (25%) */}
        <aside className="w-1/4 border-r border-white/10 bg-panel p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">关注列表 (Watchlist)</h2>
          {/* 这里预留给列表内容 */}
        </aside>

        {/* 中间主内容 (50%) */}
        <section className="w-1/2 p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">股票图表与详情 (Chart & Details)</h2>
          {/* 这里预留给图表内容 */}
        </section>

        {/* 右侧分析栏 (25%) */}
        <aside className="w-1/4 border-l border-white/10 bg-panel p-4 overflow-y-auto">
          <h2 className="text-gray-400 text-sm font-semibold mb-4">AI 分析与新闻 (AI Analysis & News)</h2>
          {/* 这里预留给分析内容 */}
        </aside>
      </main>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 3: 提交更改**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: implement Dashboard component with three-column layout"
```

### Task 3: 在 `App.tsx` 中集成 Dashboard

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 替换 `src/App.tsx` 内容**

```tsx
import Dashboard from './components/Dashboard';

/**
 * 根组件，集成主仪表盘
 */
function App() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <Dashboard />
    </div>
  );
}

export default App;
```

- [ ] **Step 2: 提交更改**

```bash
git add src/App.tsx
git commit -m "feat: integrate Dashboard into App"
```

### Task 4: 验证布局

- [ ] **Step 1: 检查文件并确认编译**

Run: `ls -R src/`

- [ ] **Step 2: 运行 lint 检查（可选）**

Run: `uv run ruff check --fix && npm run lint` (假设项目中已配置)
注：根据 GEMINI.md，应运行 `uv run ruff check --fix`。

- [ ] **Step 3: 提交并推送**

```bash
git add src/
git commit -m "feat: implement main dashboard layout"
git push origin HEAD
```
