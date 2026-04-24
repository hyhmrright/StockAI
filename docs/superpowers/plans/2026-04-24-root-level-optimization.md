# Root-Level Optimization & CI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition StockAI from superficial binary scrubbing to root-level path management and robust CI verification using Bun 1.2 and Tauri 2.0 best practices.

**Architecture:** Use `Bun.main` for path resolution, `--embed` for asset management, and implement a "Pre-sign & Verify" pipeline in CI to ensure macOS app integrity.

**Tech Stack:** Bun 1.2, Tauri 2.0, Playwright, GitHub Actions, Shell.

---

## File Mapping

- `sidecar/utils.ts`: Update to use `Bun.main` for path resolution.
- `sidecar/browser-manager.ts`: Update to use `Bun.main` and `$bunfs` for asset loading.
- `sidecar/build-script.ts`: Complete refactor to use Bun 1.2 flags and add macOS pre-signing.
- `src-tauri/tauri.conf.json`: Enable `hardenedRuntime` and clean up resources.
- `.github/workflows/release.yml`: Add DMG verification steps.

---

### Task 1: Refactor Sidecar Path Resolution

**Files:**
- Modify: `sidecar/utils.ts`
- Modify: `sidecar/browser-manager.ts`

- [ ] **Step 1: Update `sidecar/utils.ts` to use `Bun.main`**

```typescript
// sidecar/utils.ts
import { join, dirname } from "path";

// 替换掉依赖 __dirname 或 process.cwd() 的逻辑
export const getExecutableDir = () => {
  return dirname(Bun.main);
};

// ... 保持现有 logger 逻辑，但路径使用 getExecutableDir()
```

- [ ] **Step 2: Update `sidecar/browser-manager.ts` to use `$bunfs` and `Bun.main`**

```typescript
// sidecar/browser-manager.ts
// 修改 setupPlaywrightResources 逻辑
private setupPlaywrightResources(): void {
  // 1. 优先尝试嵌入的 browsers.json (Bun 1.1+ $bunfs)
  const embeddedPath = "$bunfs/sidecar/browsers.json";
  
  // 注意：Playwright 可能无法直接读取 $bunfs，我们需要在运行时写出到一个临时目录或者确保它能读取。
  // 但对于配置，我们可以手动解析并设置环境变量。
  
  const exeDir = dirname(Bun.main);
  // ... 其他候选路径
}
```

- [ ] **Step 3: Run sidecar tests locally**

Run: `cd sidecar && bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add sidecar/utils.ts sidecar/browser-manager.ts
git commit -m "refactor: use Bun.main and $bunfs for sidecar path resolution"
```

### Task 2: Refactor Sidecar Build Script

**Files:**
- Modify: `sidecar/build-script.ts`

- [ ] **Step 1: Implement simplified build with `--embed` and `codesign`**

```typescript
// sidecar/build-script.ts
// ... imports
const identity = process.env.APPLE_SIGNING_IDENTITY;

// Step 1: Build command
const buildArgs = [
  "bun", "build", "sidecar/index.ts",
  "--compile",
  "--minify",
  "--embed", "sidecar/browsers.json",
  "--target", target,
  "--outfile", outfile
];

// Step 2: Pre-sign for macOS
if (os.platform() === "darwin" && identity) {
  console.log("🖋️ Pre-signing sidecar binary...");
  const signProc = Bun.spawn([
    "codesign", "--force", "--options", "runtime",
    "--entitlements", "src-tauri/Entitlements.plist",
    "--sign", identity, outfile
  ]);
  await signProc.exited;
}
```

- [ ] **Step 2: Test local sidecar build**

Run: `bun sidecar/build-script.ts`
Expected: Successful binary generation in `src-tauri/bin/` with no project paths (verified via `strings`).

- [ ] **Step 3: Commit**

```bash
git add sidecar/build-script.ts
git commit -m "feat: optimize sidecar build with Bun 1.2 flags and pre-signing"
```

### Task 3: Update Tauri Configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Enable `hardenedRuntime` and clean up `resources`**

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "macOS": {
      "hardenedRuntime": true,
      "entitlements": "./Entitlements.plist"
    },
    "resources": [] // 移除 bin/browsers.json，因为它已嵌入
  }
}
```

- [ ] **Step 2: Verify `tauri.conf.json` schema**

Run: `bun tauri build --dry-run`
Expected: No configuration errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: enable hardenedRuntime and cleanup redundant resources"
```

### Task 4: CI Pipeline Integration & Verification

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add DMG verification step to `release.yml`**

```yaml
# .github/workflows/release.yml
      - name: Verify Bundle Integrity
        if: matrix.platform == 'macos-latest'
        shell: bash
        run: |
          # 寻找生成的 DMG (假设在 target 目录下)
          DMG_PATH=$(find src-tauri/target -name "*.dmg" | head -n 1)
          if [ -z "$DMG_PATH" ]; then echo "❌ DMG not found"; exit 1; fi
          
          echo "📂 Mounting $DMG_PATH..."
          hdiutil attach "$DMG_PATH" -mountpoint /tmp/stockai_mnt
          
          echo "🔍 Verifying Gatekeeper status..."
          spctl --assess --verbose /tmp/stockai_mnt/StockAI.app
          
          echo "🖋️ Checking Sidecar signature..."
          codesign -vvv --deep --strict /tmp/stockai_mnt/StockAI.app/Contents/MacOS/stockai-backend-*
          
          hdiutil detach /tmp/stockai_mnt
```

- [ ] **Step 2: Update Audit step to be more concise**

```yaml
      - name: Audit Sidecar Purity
        run: |
          # 使用 strings 命令确保二进制中不包含 runner 路径
          ! strings src-tauri/bin/${{ matrix.sidecar-name }} | grep -E "/Users/runner|/Users/hyh"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add automated DMG verification and simplify sidecar audit"
```

### Task 5: Final Validation & Documentation

**Files:**
- Modify: `GEMINI.md`

- [ ] **Step 1: Update `GEMINI.md` with the new "Root Level" build process**

- [ ] **Step 2: Run final smoke test**

Run: `bun scripts/smoke-test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add GEMINI.md
git commit -m "docs: update GEMINI.md with optimized release process"
```
