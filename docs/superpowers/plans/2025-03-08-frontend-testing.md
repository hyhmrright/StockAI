# 建立前端测试体系 (Vitest + React Testing Library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 React 前端引入 Vitest 测试框架，并覆盖核心 Hook (`useAnalysis`) 和基础组件 (`SentimentBar`)。

**Architecture:** 使用 Vitest 作为测试运行器，jsdom 作为测试环境，@testing-library/react 用于测试组件和 Hooks。

**Tech Stack:** Vitest, React, jsdom, @testing-library/react, @testing-library/jest-dom.

---

### Task 1: 配置 Vitest 环境

**Files:**
- Create: `/Users/hyh/code/StockAI/.worktrees/test-quality-overhaul/vitest.config.ts`
- Modify: `/Users/hyh/code/StockAI/.worktrees/test-quality-overhaul/package.json`

- [ ] **Step 1: 创建 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 2: 创建测试初始化文件 `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// 可以在这里添加全局的 mocks 或配置
```

- [ ] **Step 3: 修改 `package.json` 添加测试脚本**

在 `scripts` 中添加 `"test:ui": "vitest"`。

- [ ] **Step 4: 提交配置变更**

```bash
git add vitest.config.ts src/test/setup.ts package.json
git commit -m "test: configure Vitest with jsdom and react support"
```

---

### Task 2: 为 `useAnalysis` Hook 编写测试

**Files:**
- Create: `/Users/hyh/code/StockAI/.worktrees/test-quality-overhaul/src/hooks/useAnalysis.test.ts`

- [ ] **Step 1: 编写 `useAnalysis.test.ts`**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAnalysis } from './useAnalysis';
import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
import { vi, describe, it, expect } from 'vitest';

// 模拟 IPC 调用
vi.mock('../lib/ipc', () => ({
  startAnalysis: vi.fn(),
}));

describe('useAnalysis Hook', () => {
  it('应该能正常处理分析流程的状态流转', async () => {
    const mockResult = JSON.stringify({
      symbol: 'AAPL',
      price: 150,
      change: 2.5,
      change_percent: 1.7,
      summary: '看涨',
      sentiment: { bullish: 80, bearish: 20 },
      news: []
    });

    (startAnalysisIpc as any).mockResolvedValue(mockResult);

    const { result } = renderHook(() => useAnalysis());

    expect(result.current.step).toBe('idle');

    // 执行分析
    await act(async () => {
      const promise = result.current.performAnalysis('AAPL');
      // 在异步操作中间检查状态
      // 由于 performAnalysis 是 async，这里会立即执行到第一个 await 之前
      expect(result.current.step).toBe('scraping');
      await promise;
    });

    expect(result.current.step).toBe('completed');
    expect(result.current.result?.symbol).toBe('AAPL');
    expect(result.current.error).toBeNull();
  });

  it('应该能正确处理错误情况', async () => {
    (startAnalysisIpc as any).mockRejectedValue(new Error('网络错误'));

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.performAnalysis('AAPL');
    });

    expect(result.current.step).toBe('error');
    expect(result.current.error).toBe('网络错误');
  });
});
```

- [ ] **Step 2: 提交 Hook 测试**

```bash
git add src/hooks/useAnalysis.test.ts
git commit -m "test: add unit tests for useAnalysis hook"
```

---

### Task 3: 为 `SentimentBar` 组件编写测试

**Files:**
- Create: `/Users/hyh/code/StockAI/.worktrees/test-quality-overhaul/src/components/SentimentBar.test.tsx`

- [ ] **Step 1: 编写 `SentimentBar.test.tsx`**

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import SentimentBar from './SentimentBar';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('SentimentBar Component', () => {
  it('应该正确渲染看涨和看跌百分比', () => {
    render(<SentimentBar bullish={75} />);
    
    expect(screen.getByText('看涨 75%')).toBeInTheDocument();
    expect(screen.getByText('看跌 25%')).toBeInTheDocument();
  });

  it('进度条宽度应该反映百分比', () => {
    const { container } = render(<SentimentBar bullish={60} />);
    
    // 查找代表看涨部分的 div
    const bars = container.querySelectorAll('.bg-emerald-500');
    expect(bars.length).toBe(1);
    expect(bars[0]).toHaveStyle({ width: '60%' });

    // 查找代表看跌部分的 div
    const bearishBars = container.querySelectorAll('.bg-rose-500');
    expect(bearishBars.length).toBe(1);
    expect(bearishBars[0]).toHaveStyle({ width: '40%' });
  });
});
```

- [ ] **Step 2: 提交组件测试**

```bash
git add src/components/SentimentBar.test.tsx
git commit -m "test: add unit tests for SentimentBar component"
```

---

### Task 4: 验证与最终检查

- [ ] **Step 1: 运行测试（如果环境允许）**

Run: `npx vitest run`

- [ ] **Step 2: 最终提交**

确保所有文件已保存并符合规范。
