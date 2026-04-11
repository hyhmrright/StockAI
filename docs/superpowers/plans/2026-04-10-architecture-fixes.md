# Architecture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Brooks-Lint 架构审计发现的 3 类问题：stdout 协议脆弱、配置无版本控制、IPC 层抽象不足。

**Architecture:** 三层架构（UI → Rust → Sidecar）保持不变；仅加固层间通信协议：(1) stdout 设写入防护防止多次输出，(2) 配置带版本字段让 Sidecar 能拒绝不兼容格式，(3) IPC 层内部完成 JSON 解析，调用方只接触强类型对象。

**Tech Stack:** TypeScript (Vitest + Bun test), Rust (cargo test), React (Testing Library)

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `sidecar/configResolver.ts` | 新建 | `resolveConfig()` 独立模块，可测试 |
| `sidecar/configResolver.test.ts` | 新建 | resolveConfig 的版本校验测试 |
| `sidecar/utils.ts` | 修改 | `outputJson()` 添加单次写入防护 |
| `sidecar/utils.test.ts` | 修改 | 添加防护测试 |
| `sidecar/index.ts` | 修改 | 引用 configResolver，添加 stdout 协议注释 |
| `shared/constants.ts` | 修改 | 添加 `CONFIG_VERSION = "2"` |
| `src/hooks/useSettings.ts` | 修改 | `Settings` 接口和默认值加入 `_version` |
| `src-tauri/src/lib.rs` | 修改 | stdout 改为取最后一行非空内容 |
| `src/lib/ipc.ts` | 修改 | `startAnalysis()` 内部解析 JSON，返回强类型 |
| `src/hooks/useAnalysis.ts` | 修改 | 移除 JSON 解析逻辑 |
| `src/hooks/useAnalysis.test.ts` | 修改 | 更新 mock：返回对象而非 JSON 字符串 |

---

## Task 1: stdout 单次写入防护

**Files:**
- Modify: `sidecar/utils.ts`
- Modify: `sidecar/utils.test.ts`

- [ ] **Step 1.1: 修改 `outputJson()` 添加防护与测试辅助**

  替换 `sidecar/utils.ts` 中的 `outputJson` 函数（完整替换第 44-49 行）：

  ```typescript
  let _stdoutWritten = false;

  /**
   * 标准化结果输出
   * 协议约定：每个 Sidecar 进程只允许调用一次，输出单行 JSON 后退出。
   * 重复调用视为协议违规，直接抛出异常防止静默数据损坏。
   */
  export function outputJson(data: unknown): void {
    if (_stdoutWritten) {
      throw new Error('[PROTOCOL] outputJson called more than once in the same process');
    }
    _stdoutWritten = true;
    process.stdout.write(JSON.stringify(data) + '\n');
  }

  /** 仅供测试使用：重置写入防护状态 */
  export function _resetOutputGuard(): void {
    _stdoutWritten = false;
  }
  ```

- [ ] **Step 1.2: 在 `utils.test.ts` 中添加 `outputJson` 防护测试**

  在 `sidecar/utils.test.ts` 末尾追加（`bun:test` 风格）：

  ```typescript
  import { outputJson, _resetOutputGuard } from "./utils";
  import { beforeEach, spyOn } from "bun:test";

  describe("outputJson", () => {
    beforeEach(() => {
      _resetOutputGuard();
    });

    test("首次调用应写入 stdout", () => {
      const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
      outputJson({ ok: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe('{"ok":true}\n');
      spy.mockRestore();
    });

    test("第二次调用应抛出协议违规错误", () => {
      const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
      outputJson({ first: true });
      expect(() => outputJson({ second: true })).toThrow("[PROTOCOL]");
      spy.mockRestore();
    });
  });
  ```

- [ ] **Step 1.3: 运行 sidecar 测试，确认通过**

  ```bash
  cd sidecar && bun test utils.test.ts
  ```

  期望：所有测试（包括新增的 `outputJson` 测试）PASS。

- [ ] **Step 1.4: 修改 Rust `lib.rs` — stdout 改为取最后一行**

  当前 `run_analysis` 和 `list_models` 都使用 `output.push_str()` 累加所有行。改为取最后一行非空内容。

  将 `run_analysis` 函数中的 `let mut output = String::new();` 及其 `while` 循环替换为：

  ```rust
  let mut last_line = String::new();
  while let Some(event) = rx.recv().await {
      match event {
          tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
              let s = String::from_utf8_lossy(&line);
              let trimmed = s.trim();
              if !trimmed.is_empty() {
                  last_line = trimmed.to_string();
              }
          }
          tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
              eprintln!("Sidecar Stderr: {}", String::from_utf8_lossy(&line));
          }
          tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
              println!("Sidecar 已终止，状态码: {:?}", status.code);
          }
          _ => {}
      }
  }
  Ok(last_line)
  ```

  同样对 `list_models` 函数做相同替换（把 `let mut output = String::new();` 和对应 while 循环改为 `last_line` 模式）。

- [ ] **Step 1.5: 运行 Rust 测试**

  ```bash
  cd src-tauri && cargo test
  ```

  期望：PASS（greet 测试通过）。

- [ ] **Step 1.6: Commit**

  ```bash
  git add sidecar/utils.ts sidecar/utils.test.ts src-tauri/src/lib.rs
  git commit -m "fix: enforce single stdout write and defensive last-line extraction

  - outputJson() now throws on second call to prevent stdout protocol
    violations; _resetOutputGuard() exported for test isolation
  - Rust SidecarManager switches from push_str accumulation to last-line
    tracking, making it robust against accidental multi-line stdout"
  ```

---

## Task 2: 配置版本化 + resolveConfig 精简

**Files:**
- Modify: `shared/constants.ts`
- Create: `sidecar/configResolver.ts`
- Create: `sidecar/configResolver.test.ts`
- Modify: `sidecar/index.ts`
- Modify: `src/hooks/useSettings.ts`

- [ ] **Step 2.1: 在 `shared/constants.ts` 添加版本常量**

  在文件末尾追加：

  ```typescript
  /**
   * 配置格式版本号。每次 Settings / Sidecar 配置结构发生 breaking change 时递增。
   * Sidecar 会拒绝不匹配此版本的配置，防止静默降级。
   */
  export const CONFIG_VERSION = "2";
  ```

- [ ] **Step 2.2: 新建 `sidecar/configResolver.ts`**

  ```typescript
  import { PROVIDER_DEFAULTS } from '../shared/constants';
  import { CONFIG_VERSION } from '../shared/constants';
  import { ProviderType } from '../shared/types';

  export interface ResolvedConfig {
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    modelName: string;
    deepMode: boolean;
  }

  /**
   * 从 Rust 传入的原始配置 JSON 中解析有效配置。
   * 仅支持当前格式版本（CONFIG_VERSION）；版本不匹配时抛出，
   * 错误由调用方序列化为 { error } 写入 stdout。
   */
  export function resolveConfig(raw: unknown): ResolvedConfig {
    const obj = raw as Record<string, any>;

    if (obj._version !== CONFIG_VERSION) {
      throw new Error(
        `配置格式版本不兼容（期望 "${CONFIG_VERSION}"，收到 "${obj._version ?? '无'}"）。请在设置界面重新保存配置。`
      );
    }

    const provider = (obj.activeProvider ?? 'ollama') as ProviderType;
    const providerCfg: Record<string, string> = obj.providerConfigs?.[provider] ?? {};
    const defaults = PROVIDER_DEFAULTS[provider] ?? { baseUrl: '', model: '' };

    return {
      provider,
      apiKey:     providerCfg.apiKey    ?? '',
      baseUrl:    providerCfg.baseUrl   ?? defaults.baseUrl,
      modelName:  providerCfg.model     ?? defaults.model,
      deepMode:   obj.deepMode !== false,
    };
  }
  ```

- [ ] **Step 2.3: 新建 `sidecar/configResolver.test.ts`**

  ```typescript
  import { expect, test, describe } from "bun:test";
  import { resolveConfig } from "./configResolver";

  const validConfig = {
    _version: "2",
    activeProvider: "ollama",
    providerConfigs: {
      ollama: { apiKey: "", baseUrl: "http://localhost:11434", model: "qwen3.5:9b" },
    },
    deepMode: true,
  };

  describe("resolveConfig", () => {
    test("版本匹配时正确解析配置", () => {
      const cfg = resolveConfig(validConfig);
      expect(cfg.provider).toBe("ollama");
      expect(cfg.baseUrl).toBe("http://localhost:11434");
      expect(cfg.modelName).toBe("qwen3.5:9b");
      expect(cfg.deepMode).toBe(true);
    });

    test("_version 缺失时抛出版本不兼容错误", () => {
      const bad = { activeProvider: "ollama", providerConfigs: {} };
      expect(() => resolveConfig(bad)).toThrow("版本不兼容");
    });

    test("_version 错误时抛出版本不兼容错误", () => {
      const bad = { ...validConfig, _version: "1" };
      expect(() => resolveConfig(bad)).toThrow("版本不兼容");
    });

    test("deepMode 缺省时默认为 true", () => {
      const cfg = resolveConfig({ ...validConfig, deepMode: undefined });
      expect(cfg.deepMode).toBe(true);
    });

    test("deepMode 显式为 false 时正确读取", () => {
      const cfg = resolveConfig({ ...validConfig, deepMode: false });
      expect(cfg.deepMode).toBe(false);
    });

    test("providerCfg 缺失时回退到 PROVIDER_DEFAULTS", () => {
      const cfg = resolveConfig({ ...validConfig, providerConfigs: {} });
      expect(cfg.baseUrl).toBe("http://localhost:11434");
      expect(cfg.modelName).toBe("qwen3.5:9b");
    });
  });
  ```

- [ ] **Step 2.4: 运行 configResolver 测试**

  ```bash
  cd sidecar && bun test configResolver.test.ts
  ```

  期望：6 个测试全部 PASS。

- [ ] **Step 2.5: 更新 `sidecar/index.ts` 使用 configResolver**

  将顶部 import 中移除本地 `resolveConfig` 函数，改为从 `configResolver` 导入：

  ```typescript
  // 第 1 行起，替换原有的 import + resolveConfig 函数定义
  import { performFullAnalysis } from './analysis';
  import { Ollama } from 'ollama';
  import { toErrorMessage, logger, outputJson } from './utils';
  import { resolveConfig } from './configResolver';
  ```

  删除原 `sidecar/index.ts` 第 6-29 行的 `resolveConfig` 函数定义。

  在 `main()` 中，将：
  ```typescript
  const config = resolveConfig(rawConfig);
  ```
  改为：
  ```typescript
  let config;
  try {
    config = resolveConfig(rawConfig);
  } catch (error) {
    outputJson({ error: toErrorMessage(error) });
    return;
  }
  ```

  同时在文件顶部添加协议注释：

  ```typescript
  /**
   * Sidecar stdout 协议约定：
   * 每次进程运行只允许向 stdout 写入一次 JSON 行（通过 outputJson()）。
   * 所有调试信息通过 stderr（logger.*）输出。
   * Rust 层从 stdout 取最后一行非空内容作为响应。
   */
  ```

- [ ] **Step 2.6: 更新 `src/hooks/useSettings.ts` 加入版本字段**

  导入 `CONFIG_VERSION`：
  ```typescript
  import { PROVIDER_DEFAULTS, DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS, CONFIG_VERSION } from "../../shared/constants";
  ```

  在 `Settings` 接口增加 `_version` 字段：
  ```typescript
  export interface Settings {
    _version: string;
    activeProvider: ProviderType;
    providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
    autoAnalyze: boolean;
    deepMode: boolean;
  }
  ```

  在 `DEFAULT_SETTINGS` 中加入版本：
  ```typescript
  export const DEFAULT_SETTINGS: Settings = {
    _version: CONFIG_VERSION,
    ...SHARED_DEFAULT_SETTINGS,
    providerConfigs: {
      ollama: {
        apiKey: "",
        baseUrl: PROVIDER_DEFAULTS.ollama.baseUrl,
        model: PROVIDER_DEFAULTS.ollama.model,
      },
    },
  };
  ```

  在 `loadSettings` 中，当存在旧格式（无 `activeProvider`）时，迁移并写入版本：
  ```typescript
  // 已是新格式
  if (saved.activeProvider) {
    // 补充版本字段（若来自无版本的旧新格式）
    setSettings({ ...DEFAULT_SETTINGS, ...saved, _version: CONFIG_VERSION });
  } else {
    // 迁移旧格式（v0.1.x 扁平结构）→ 新格式 + 写入版本
    const oldProvider: ProviderType = (saved.provider ?? "openai") as ProviderType;
    const migrated: Settings = {
      ...DEFAULT_SETTINGS,
      _version: CONFIG_VERSION,
      activeProvider: oldProvider,
      autoAnalyze: saved.autoAnalyze ?? true,
      deepMode: saved.deepMode ?? true,
      providerConfigs: {
        [oldProvider]: {
          apiKey: saved.apiKey ?? "",
          baseUrl: saved.baseUrl ?? PROVIDER_DEFAULTS[oldProvider].baseUrl,
          model: saved.aiModel ?? PROVIDER_DEFAULTS[oldProvider].model,
        },
      },
    };
    await store.set("app_settings", migrated);
    await store.save();
    setSettings(migrated);
  }
  ```

- [ ] **Step 2.7: 运行 sidecar 测试确认全部通过**

  ```bash
  cd sidecar && bun test
  ```

  期望：所有测试 PASS（包括新增的 configResolver 测试）。

- [ ] **Step 2.8: 运行前端类型检查**

  ```bash
  bunx tsc --noEmit
  ```

  期望：0 错误。

- [ ] **Step 2.9: Commit**

  ```bash
  git add shared/constants.ts sidecar/configResolver.ts sidecar/configResolver.test.ts sidecar/index.ts src/hooks/useSettings.ts
  git commit -m "feat: add config versioning and simplify resolveConfig

  - Add CONFIG_VERSION='2' to shared/constants.ts
  - Extract resolveConfig() to sidecar/configResolver.ts for testability
  - resolveConfig() now validates _version and throws on mismatch instead
    of silently falling back through a 5-level compatibility chain
  - useSettings.ts writes _version on every save; migrates legacy formats
    to current format + version in one pass"
  ```

---

## Task 3: IPC 层深化

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/hooks/useAnalysis.ts`
- Modify: `src/hooks/useAnalysis.test.ts`

- [ ] **Step 3.1: 更新 `ipc.ts` — `startAnalysis` 返回强类型**

  完整替换 `src/lib/ipc.ts` 内容：

  ```typescript
  import { invoke } from "@tauri-apps/api/core";
  import { FullAnalysisResponse } from "../../shared/types";

  /**
   * 判断当前是否运行在 Tauri 环境
   */
  const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

  /**
   * 从原始 stdout 字符串中解析分析结果，集中处理验证和错误转换。
   * 调用方只接触强类型的 FullAnalysisResponse，不需要处理 JSON 或错误格式。
   */
  function parseAnalysisResponse(raw: string): FullAnalysisResponse {
    if (!raw || raw.trim() === '') {
      throw new Error('分析服务无响应，请检查 AI 模型配置后重试。');
    }

    const parsed = JSON.parse(raw) as FullAnalysisResponse & { error?: string };

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    if (!parsed.analysis || typeof parsed.analysis.rating !== 'number' || !Array.isArray(parsed.news)) {
      throw new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。');
    }

    return parsed;
  }

  /**
   * 启动股票分析，返回结构化响应。
   * JSON 解析和错误提取在此层完成，调用方无需处理裸字符串。
   */
  export async function startAnalysis(symbol: string): Promise<FullAnalysisResponse> {
    if (!isTauri()) {
      console.warn("浏览器测试模式: 尝试通过 3001 桥接器获取真实数据。");
      try {
        const resp = await fetch('http://localhost:3001/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'start_analysis', args: { symbol } })
        });
        return parseAnalysisResponse(await resp.text());
      } catch (e) {
        if (e instanceof Error && e.message !== '分析服务无响应') {
          throw e;
        }
        throw new Error("自动化测试环境未就绪，无法获取真实数据。");
      }
    }

    const raw = await invoke<string>("start_analysis", { symbol });
    return parseAnalysisResponse(raw);
  }

  /**
   * 获取可用模型列表
   */
  export async function listModels(provider: string, baseUrl: string): Promise<string[]> {
    if (!isTauri()) {
      return ["gpt-4o", "gpt-4o-mini", "ollama-dev"];
    }

    try {
      const result = await invoke<string>("list_models", { provider, baseUrl });
      const parsed = JSON.parse(result);
      if (parsed.error) throw new Error(parsed.error);
      return parsed.models || [];
    } catch (error) {
      console.error("IPC 调用失败 (list_models):", error);
      return ["gpt-4o"];
    }
  }
  ```

- [ ] **Step 3.2: 简化 `useAnalysis.ts` — 移除 JSON 解析逻辑**

  完整替换 `src/hooks/useAnalysis.ts` 内容：

  ```typescript
  import { useState } from 'react';
  import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
  import { FullAnalysisResponse } from '../../shared/types';

  export type AnalysisStep = 'idle' | 'scraping' | 'extracting' | 'analyzing' | 'completed' | 'error';

  /**
   * 股票分析 Hook
   * 封装分析流程、状态管理和细分进度
   */
  export function useAnalysis() {
    const [step, setStep] = useState<AnalysisStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<FullAnalysisResponse | null>(null);

    /**
     * 执行股票分析
     * @param symbol 股票代码
     */
    async function performAnalysis(symbol: string) {
      if (!symbol) return;

      setStep('scraping');
      setError(null);
      setResult(null);

      try {
        // IPC 层负责 JSON 解析、错误提取和结构验证；此处直接获得强类型结果
        const analysisResult = await startAnalysisIpc(symbol);
        setStep('analyzing');
        setResult(analysisResult);
        setStep('completed');
      } catch (err) {
        console.error('分析执行失败:', err);
        const msg = err instanceof Error ? err.message : '分析过程中发生错误，请重试。';
        setError(msg);
        setStep('error');
      }
    }

    return {
      step,
      loading: step !== 'idle' && step !== 'completed' && step !== 'error',
      error,
      result,
      performAnalysis
    };
  }
  ```

- [ ] **Step 3.3: 更新 `useAnalysis.test.ts` — mock 返回对象而非字符串**

  完整替换 `src/hooks/useAnalysis.test.ts` 内容：

  ```typescript
  import { renderHook, act } from '@testing-library/react';
  import { useAnalysis } from './useAnalysis';
  import { startAnalysis as startAnalysisIpc } from '../lib/ipc';
  import { vi, describe, it, expect } from 'vitest';
  import { FullAnalysisResponse } from '../../shared/types';

  vi.mock('../lib/ipc', () => ({
    startAnalysis: vi.fn(),
  }));

  function createMockAnalysisResponse(overrides: Partial<FullAnalysisResponse> = {}): FullAnalysisResponse {
    return {
      symbol: 'AAPL',
      news: [
        { title: '测试新闻', source: 'Test', date: '2025-01-01', content: '内容', url: 'http://test.com' }
      ],
      analysis: {
        rating: 80,
        sentiment: 'bullish',
        summary: '看涨总结',
        pros: ['利多'],
        cons: ['利空']
      },
      ...overrides
    };
  }

  describe('useAnalysis Hook', () => {
    it('应该能正常处理分析流程的状态流转并传递正确的参数', async () => {
      const symbol = 'TSLA';
      // IPC 现在直接返回强类型对象，不再是 JSON 字符串
      (startAnalysisIpc as any).mockResolvedValue(createMockAnalysisResponse({ symbol }));

      const { result } = renderHook(() => useAnalysis());
      expect(result.current.step).toBe('idle');

      await act(async () => {
        await result.current.performAnalysis(symbol);
      });

      expect(startAnalysisIpc).toHaveBeenCalledWith(symbol);
      expect(result.current.step).toBe('completed');
      expect(result.current.result?.symbol).toBe(symbol);
      expect(result.current.error).toBeNull();
    });

    it('IPC 层抛出格式验证错误时应展示错误', async () => {
      // 验证逻辑已移至 ipc.ts；useAnalysis 只需正确处理 rejected promise
      (startAnalysisIpc as any).mockRejectedValue(
        new Error('分析结果格式异常，请检查 AI 模型是否正确返回了 JSON。')
      );

      const { result } = renderHook(() => useAnalysis());

      await act(async () => {
        await result.current.performAnalysis('AAPL');
      });

      expect(result.current.step).toBe('error');
      expect(result.current.error).toContain('格式异常');
    });

    it('IPC 层抛出空响应错误时应展示错误', async () => {
      (startAnalysisIpc as any).mockRejectedValue(
        new Error('分析服务无响应，请检查 AI 模型配置后重试。')
      );

      const { result } = renderHook(() => useAnalysis());

      await act(async () => {
        await result.current.performAnalysis('AAPL');
      });

      expect(result.current.step).toBe('error');
      expect(result.current.error).toContain('无响应');
    });

    it('Sidecar 返回 error JSON 时应展示错误信息', async () => {
      // ipc.ts 已将 { error: "..." } 转换为 thrown Error
      (startAnalysisIpc as any).mockRejectedValue(new Error('未搜寻到相关新闻'));

      const { result } = renderHook(() => useAnalysis());

      await act(async () => {
        await result.current.performAnalysis('AAPL');
      });

      expect(result.current.step).toBe('error');
      expect(result.current.error).toBe('未搜寻到相关新闻');
    });

    it('应该能正确处理网络异常情况', async () => {
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

- [ ] **Step 3.4: 运行前端测试**

  ```bash
  bunx vitest run
  ```

  期望：所有测试 PASS（包括更新后的 useAnalysis 测试）。

- [ ] **Step 3.5: 运行类型检查**

  ```bash
  bunx tsc --noEmit
  ```

  期望：0 错误。

- [ ] **Step 3.6: Commit**

  ```bash
  git add src/lib/ipc.ts src/hooks/useAnalysis.ts src/hooks/useAnalysis.test.ts
  git commit -m "refactor: deepen IPC abstraction — startAnalysis returns FullAnalysisResponse

  - Extract parseAnalysisResponse() in ipc.ts to centralize JSON parsing,
    empty-response check, error field extraction, and schema validation
  - startAnalysis() now returns FullAnalysisResponse, not raw string
  - useAnalysis.ts drops all JSON parsing; receives typed result directly
  - Tests updated: mocks return FullAnalysisResponse objects / throw errors
    instead of JSON strings, matching the new IPC contract"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ A1 stdout 防护 → Task 1
- ✅ A2 配置版本化 → Task 2
- ✅ B1 IPC 深化 → Task 3
- ✅ C1 resolveConfig 精简 → Task 2（版本检查替代了 5 层回退）

**Placeholder scan:** 无 TBD / TODO。

**Type consistency:**
- `resolveConfig()` 在 Task 2 定义，`sidecar/index.ts` 在同 Task 中使用 ✅
- `FullAnalysisResponse` 在 Task 3 的 `ipc.ts` 和 `useAnalysis.ts` / test 中一致 ✅
- `CONFIG_VERSION` 在 Task 2 定义，在 `useSettings.ts` 和 `configResolver.ts` 中使用 ✅
