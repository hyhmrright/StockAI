# Root-Level macOS Fix & CI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix macOS "Damaged" errors and Bun JIT issues by configuring proper Entitlements, production-grade Tauri settings, and optimized Sidecar build logic.

**Architecture:** Implement standard macOS Entitlements for Bun JIT and library validation, update Tauri config, and refine the Sidecar build script to ensure binary purity and compatibility with Bun 1.2.

**Tech Stack:** Tauri 2.0, Bun 1.2, GitHub Actions, macOS Security Framework.

---

### Task 1: macOS Security Configuration (Entitlements)

**Files:**
- Modify: `src-tauri/Entitlements.plist`

- [ ] **Step 1: Update Entitlements.plist**
Add the `com.apple.security.cs.disable-library-validation` key to the existing plist.

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
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 2: Verify file structure**
Run: `cat src-tauri/Entitlements.plist`
Expected: File contains the new key.

- [ ] **Step 3: Commit**
```bash
git add src-tauri/Entitlements.plist
git commit -m "chore: add disable-library-validation entitlement for macOS"
```

---

### Task 2: Sidecar Build Script Optimization

**Files:**
- Modify: `sidecar/build-script.ts`

- [ ] **Step 1: Enhance path scrubbing and integrity check**
Update `sidecar/build-script.ts` with more robust scrubbing and a strict exit code for purity violations.

```typescript
// Modify Step 6 in sidecar/build-script.ts
// ...
const forbiddenStrings = ["/Users/", "/runner/", "/work/"];
let hasLeak = false;

for (const forbidden of forbiddenStrings) {
    if (binaryText.includes(forbidden)) {
        console.error(`❌ CRITICAL ERROR: Forbidden string "${forbidden}" detected in binary! Path leak risk.`);
        hasLeak = true;
    }
}

if (hasLeak) {
    process.exit(1); // Fail the build if paths leak
} else {
    console.log("✨ Binary is PURE (No absolute path leaks found).");
}
```

- [ ] **Step 2: Run local sidecar build**
Run: `bun sidecar/build-script.ts`
Expected: Build success and "Binary is PURE".

- [ ] **Step 3: Commit**
```bash
git add sidecar/build-script.ts
git commit -m "build: enforce sidecar binary purity with strict exit codes"
```

---

### Task 3: GitHub Actions Pipeline Optimization

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add Audit Step and Secret Check**
Add a step to verify sidecar purity and check for signing secrets.

```yaml
      - name: Build sidecar binary
        # ... existing env ...
        run: |
          mkdir -p src-tauri/bin
          bun sidecar/build-script.ts

      - name: Audit Sidecar Purity
        shell: bash
        run: |
          BINARY="src-tauri/bin/${{ matrix.sidecar-name }}"
          if grep -qE "/Users/|/runner/|/work/" "$BINARY"; then
            echo "❌ Sidecar contains absolute paths!"
            grep -oaE "/Users/[^[:space:]]*|/runner/[^[:space:]]*|/work/[^[:space:]]*" "$BINARY" | head -n 5
            exit 1
          fi
          echo "✅ Sidecar purity verified."

      - name: Check Signing Secrets
        shell: bash
        run: |
          if [ -z "${{ secrets.APPLE_CERTIFICATE }}" ]; then
            echo "⚠️ WARNING: APPLE_CERTIFICATE is missing. Signing will fail or produce unsigned app."
          else
            echo "✅ APPLE_CERTIFICATE detected."
          fi
```

- [ ] **Step 2: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "ci: add sidecar audit and secret pre-flight check"
```

---

### Task 4: Verification Tooling

**Files:**
- Create: `scripts/verify-bundle.ts`

- [ ] **Step 1: Create verification script**
Create a script that can verify the integrity of the built bundle or binary.

```typescript
import { file } from "bun";
import * as path from "path";

const target = process.argv[2];
if (!target) {
    console.error("Usage: bun scripts/verify-bundle.ts <path-to-binary-or-app>");
    process.exit(1);
}

const binaryContent = await file(target).arrayBuffer();
const binaryText = Buffer.from(binaryContent).toString('utf-8');
const forbidden = ["/Users/", "/runner/", "/work/"];

console.log(`🔍 Verifying ${target}...`);
let clean = true;
for (const f of forbidden) {
    if (binaryText.includes(f)) {
        console.error(`❌ Found leaked path pattern: ${f}`);
        clean = false;
    }
}

if (clean) {
    console.log("✅ No absolute path leaks detected.");
} else {
    process.exit(1);
}
```

- [ ] **Step 2: Commit**
```bash
git add scripts/verify-bundle.ts
git commit -m "test: add bundle verification script"
```

---

### Task 5: Documentation

**Files:**
- Modify: `GEMINI.md`

- [ ] **Step 1: Add macOS Release Checklist**
Update the documentation to include the necessary steps for a successful release.

- [ ] **Step 2: Commit**
```bash
git add GEMINI.md
git commit -m "docs: add macOS release checklist"
```
