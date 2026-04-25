# macOS DMG Fundamental Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "damaged" DMG issues by optimizing Bun compilation, cleaning extended attributes, and ensuring robust codesigning/notarization in CI.

**Architecture:** 
- Disable Bun's internal ad-hoc signing using `BUN_NO_CODESIGN_MACHO_BINARY=1`.
- Proactively clean Mach-O attributes with `xattr -cr` before signing.
- Use `tauri-action` for centralized notarization while ensuring the sidecar inherits the correct entitlements.

**Tech Stack:** Bun 1.2+, Tauri 2.0, GitHub Actions, Apple Codesign.

---

### Task 1: Sidecar Build Script Optimization

**Files:**
- Modify: `sidecar/build-script.ts`

- [ ] **Step 1: Update build-script to disable Bun auto-signing**

Modify `sidecar/build-script.ts` to set `BUN_NO_CODESIGN_MACHO_BINARY=1` in the environment when spawning the build process.

```typescript
// Find the buildArgs and spawn call
    const buildArgs = [
        "bun", "build", "sidecar/index.ts",
        "--compile",
        "--minify",
        "--embed", "sidecar/browsers.json",
        "--target", target,
        "--outfile", outfile
    ];

    console.log("🛠️  Compiling sidecar with --embed and NO_CODESIGN...");
    const proc = Bun.spawn(buildArgs, { 
        stdout: "inherit", 
        stderr: "inherit",
        env: { ...process.env, BUN_NO_CODESIGN_MACHO_BINARY: "1" } // CRITICAL FIX
    });
```

- [ ] **Step 2: Run local build to verify sidecar generation**

Run: `bun sidecar/build-script.ts`
Expected: Binary generated at `src-tauri/bin/stockai-backend-darwin-arm64` (or similar).

- [ ] **Step 3: Commit**

```bash
git add sidecar/build-script.ts
git commit -m "build: disable Bun auto-signing for cleaner codesign"
```

---

### Task 2: Enhance Release Workflow with Attribute Cleanup

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add recursive attribute cleanup before build**

Add a step to `release.yml` before the `Build and publish release` step to ensure no quarantine flags exist.

```yaml
      - name: Deep Cleanup of Extended Attributes
        if: matrix.platform == 'macos-latest'
        shell: bash
        run: |
          echo "🧹 Cleaning up attributes for signing..."
          find . -type f -exec xattr -c {} \; || true
```

- [ ] **Step 2: Ensure correct Entitlements path in release.yml diagnostic**

Update the diagnostic step to ensure it checks the correct path in the bundle.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add deep attribute cleanup for macOS signing"
```

---

### Task 3: Verify Tauri Configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Verify Hardened Runtime and Entitlements**

Ensure `hardenedRuntime` is true and `entitlements` points to the correct file.

```json
    "macOS": {
      "entitlements": "./Entitlements.plist",
      "signingIdentity": null,
      "hardenedRuntime": true,
      "minimumSystemVersion": "10.13"
    },
```

- [ ] **Step 2: Commit if changed**

```bash
git add src-tauri/tauri.conf.json
git commit -m "config: confirm hardened runtime for macOS"
```

---

### Task 4: Final Verification (Smoke Test)

- [ ] **Step 1: Run integrated smoke test**

Run: `bun scripts/smoke-test.ts`
Expected: PASS (checks that the app can communicate with the sidecar).

- [ ] **Step 2: Manual push to trigger CI (Optional)**

Inform the user that pushing to a tag will now use the optimized pipeline.
