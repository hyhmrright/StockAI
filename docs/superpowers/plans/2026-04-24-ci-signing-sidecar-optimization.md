# Root-Level CI/CD & Sidecar Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix macOS "damaged" errors and Bun JIT issues by configuring proper Entitlements, production-grade Tauri settings, and optimized Sidecar build logic.

**Architecture:** Implement standard macOS Entitlements for Bun JIT, update Tauri config to use these entitlements, and refine the Sidecar build script to ensure binary purity and compatibility with Bun 1.2.

**Tech Stack:** Tauri 2.0, Bun 1.2, GitHub Actions, macOS Security Framework.

---

### Task 1: macOS Security Configuration

**Files:**
- Create: `src-tauri/Entitlements.plist`

- [ ] **Step 1: Create Entitlements.plist**
Create the file with necessary keys for Bun JIT and network access.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 2: Verify file existence**
Run: `ls -l src-tauri/Entitlements.plist`
Expected: File exists and has correct XML structure.

- [ ] **Step 3: Commit**
```bash
git add src-tauri/Entitlements.plist
git commit -m "chore: add macOS entitlements for Bun JIT"
```

---

### Task 2: Tauri Production Configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update bundle configuration**
Add `macOS` specific settings and link the entitlements.

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "macOS": {
      "entitlements": "./Entitlements.plist",
      "signingIdentity": null,
      "minimumSystemVersion": "10.13"
    },
    "externalBin": [
      "bin/stockai-backend"
    ],
    "resources": [
      "bin/browsers.json"
    ]
  }
}
```

- [ ] **Step 2: Verify config validity**
Run: `bun tauri build --dry-run` (if supported) or check JSON syntax.
Expected: Valid JSON and Tauri accepts the path to entitlements.

- [ ] **Step 3: Commit**
```bash
git add src-tauri/tauri.conf.json
git commit -m "config: set up macOS bundle metadata and entitlements"
```

---

### Task 3: Sidecar Build Script Optimization

**Files:**
- Modify: `sidecar/build-script.ts`

- [x] **Step 1: Enhance path scrubbing logic**
Update the script to handle Bun 1.2 internal path patterns and add a verification step.

```typescript
// Add to pathsToScrub in sidecar/build-script.ts
const pathsToScrub = [
    projectRoot,
    projectRoot.replace(/\//g, "\\\\"),
    "/Users/runner/work/StockAI/StockAI",
    "/Users/runner/work",
    "Users/runner/work"
];

// ... inside the script, add a post-build check:
const binaryContent = await file(outfile).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');
const forbidden = ["/Users/", "/runner/", "/work/"];
for (const f of forbidden) {
    if (binaryText.includes(f)) {
        console.warn(`⚠️ WARNING: Forbidden string '${f}' detected in binary!`);
        // Optional: fail build if purity is required
    }
}
```

- [x] **Step 2: Run local sidecar build**
Run: `bun run sidecar:build`
Expected: Build success and "Binary is PURE" or minimal warnings.

- [x] **Step 3: Commit**
```bash
git add sidecar/build-script.ts
git commit -m "build: optimize sidecar build script for Bun 1.2 and path purity"
```

---

### Task 4: GitHub Actions Production Pipeline

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add signing secrets to the environment**
Update the `release` job to include the full set of Apple signing variables.

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

- [ ] **Step 2: Ensure sidecar build order**
Verify that `Build sidecar binary` step remains before `Build and publish release`.

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "ci: integrate macOS signing and notarization support"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run integrated smoke test**
Run: `bun scripts/smoke-test.ts`
Expected: Smoke test passes (verifying IPC and basic sidecar functionality).

- [ ] **Step 2: Check for any lint/type errors**
Run: `bunx tsc --noEmit`
Expected: No errors.
