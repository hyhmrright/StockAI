# 前后端 IPC 通信与 Sidecar 绑定 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Tauri 前端与通过 Bun 编译的 Sidecar (scraper.ts) 之间的通信。

**Architecture:** 前端通过 Tauri IPC 调用 Rust 命令，Rust 命令通过 `tauri::process::Command` 运行 Sidecar 可执行文件并获取结果。

**Tech Stack:** Tauri, Rust, Bun, TypeScript, Playwright.

---

### Task 1: 构建 Sidecar 可执行文件

**Files:**
- Create: `sidecar/stockai-backend-aarch64-apple-darwin` (由构建命令生成)

- [ ] **Step 1: 确定目标三元组**
获取 `aarch64-apple-darwin` (已确定)。

- [ ] **Step 2: 使用 Bun 编译 scraper.ts**
运行: `bun build ./sidecar/scraper.ts --compile --outfile sidecar/stockai-backend-aarch64-apple-darwin`

- [ ] **Step 3: 验证可执行文件是否生成**
运行: `ls -l sidecar/stockai-backend-aarch64-apple-darwin`

- [ ] **Step 4: 测试可执行文件**
运行: `./sidecar/stockai-backend-aarch64-apple-darwin AAPL` (如果 playwright 依赖正常)

### Task 2: 配置 Tauri Sidecar

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 在 tauri.conf.json 中添加 sidecar 配置**
在 `bundle -> externalBin` 中添加 `"sidecar/stockai-backend"`。

- [ ] **Step 2: 确保权限允许访问 Sidecar**
检查 `src-tauri/capabilities/default.json`。

### Task 3: 编写 Rust 交互逻辑

**Files:**
- Modify: `src-tauri/src/main.rs` (或 `src-tauri/src/lib.rs`)

- [ ] **Step 1: 定义 start_analysis 命令**
```rust
#[tauri::command]
async fn start_analysis(symbol: String) -> Result<String, String> {
    use tauri::process::Command;
    let (mut rx, mut child) = Command::new_sidecar("stockai-backend")
        .expect("未能初始化 sidecar")
        .args(&[symbol])
        .spawn()
        .expect("未能运行 sidecar");

    let mut output = String::new();
    while let Some(event) = rx.recv().await {
        if let tauri::process::CommandEvent::Stdout(line) = event {
            output.push_str(&line);
        }
    }
    Ok(output)
}
```

- [ ] **Step 2: 注册命令**
在 `tauri::Builder` 中添加 `.invoke_handler(tauri::generate_handler![start_analysis])`。

### Task 4: 实现前端 IPC 封装

**Files:**
- Create: `src/lib/ipc.ts`

- [ ] **Step 1: 创建 ipc.ts**
```typescript
import { invoke } from '@tauri-apps/api/core';

/**
 * 启动股票分析
 * @param symbol 股票代码
 * @returns 分析结果 (JSON 字符串)
 */
export async function startAnalysis(symbol: string): Promise<string> {
  try {
    const result = await invoke<string>('start_analysis', { symbol });
    return result;
  } catch (error) {
    console.error("IPC 调用失败:", error);
    throw error;
  }
}
```

### Task 5: 验证与提交

- [ ] **Step 1: 验证整个流程**
- [ ] **Step 2: 提交代码**
- [ ] **Step 3: 说明配置及构建过程**
