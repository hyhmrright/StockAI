# Root-Level macOS Signing & Notarization Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve macOS "damaged" errors and ensure flawless app execution by implementing proactive sidecar signing, robust CI certificate handling, and notarization verification.

**Architecture:** Implement ad-hoc signing for the Bun sidecar using project entitlements before bundling, ensuring Tauri's bundler can correctly upgrade the signature. Optimize GitHub Actions for explicit certificate import and notarization confirmation.

**Tech Stack:** Tauri 2.0, Bun 1.2+, GitHub Actions, macOS Security Framework.

---

### Task 1: Proactive Sidecar Signing

**Files:**
- Modify: `sidecar/build-script.ts`

- [ ] **Step 1: Update build script with codesign logic**
Add a conditional block to sign the sidecar on macOS using the project's entitlements.

```typescript
// 在 Step 5 之后，Step 6 (自检) 之前添加
if (process.platform === 'darwin') {
    console.log("🍎 macOS detected: Performing proactive ad-hoc signing...");
    const entitlementsPath = path.join(projectRoot, "src-tauri/Entitlements.plist");
    const signProc = Bun.spawn([
        "codesign", "--force",
        "--options", "runtime",
        "--entitlements", entitlementsPath,
        "--sign", "-",
        outfile
    ]);
    const signExitCode = await signProc.exited;
    if (signExitCode !== 0) {
        console.error("❌ Sidecar signing failed.");
        process.exit(1);
    }
    console.log("✅ Sidecar ad-hoc signed with JIT entitlements.");
}
```

- [ ] **Step 2: Run local sidecar build to verify signing**
Run: `bun run sidecar:build`
Expected: "Sidecar ad-hoc signed with JIT entitlements" appears in logs (if on macOS).

- [ ] **Step 3: Verify signature**
Run: `codesign -vvv --verify src-tauri/bin/stockai-backend-aarch64-apple-darwin`
Expected: `valid on disk`, `satisfies its Designated Requirement`.

- [ ] **Step 4: Commit**
```bash
git add sidecar/build-script.ts
git commit -m "build: add proactive ad-hoc signing for macOS sidecar"
```

---

### Task 2: Robust CI Keychain & Certificate Setup

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add explicit certificate import step**
Update the workflow to use `apple-actions/import-codesign-certs` before the build step.

```yaml
      - name: Import Apple Certificate
        if: matrix.platform == 'macos-latest'
        uses: apple-actions/import-codesign-certs@v3
        with:
          p12-file-base64: ${{ secrets.APPLE_CERTIFICATE }}
          p12-password: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
```

- [ ] **Step 2: Ensure environment variables are passed correctly**
Check that `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` are in the `env` of `tauri-action`.

```yaml
      - name: Build and publish release
        uses: tauri-apps/tauri-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "ci: add explicit Apple certificate import for reliable signing"
```

---

### Task 3: Tauri 2.0 macOS Config Optimization

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Ensure bundle identifier and metadata are correct**
Verify `identifier` matches what's expected for Apple Notarization (e.g., `com.hyh.stockai`).

- [ ] **Step 2: Add signing identity and entitlements reference**
Ensure `macOS` bundle settings are complete.

```json
    "macOS": {
      "entitlements": "./Entitlements.plist",
      "signingIdentity": null,
      "minimumSystemVersion": "10.13"
    }
```

- [ ] **Step 3: Commit**
```bash
git add src-tauri/tauri.conf.json
git commit -m "config: optimize Tauri 2.0 macOS bundle settings"
```

---

### Task 4: Final Verification & Smoke Test

**Files:**
- Modify: `scripts/smoke-test.ts` (if needed)

- [ ] **Step 1: Run integrated smoke test**
Run: `bun run scripts/smoke-test.ts`
Expected: Sidecar starts, IPC works, and no signing/permission errors are logged.

- [ ] **Step 2: Manual binary check**
Check the sidecar binary for any absolute path leaks one last time.
Run: `grep -oaE "/Users/runner|/Users/hyh" src-tauri/bin/stockai-backend-aarch64-apple-darwin`
Expected: No matches.

- [ ] **Step 3: Commit all remaining changes**
```bash
git commit -am "chore: final verification of root-level signing fix"
```
