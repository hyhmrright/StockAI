# Design Spec: Root-Level CI/CD & Sidecar Optimization

**Date**: 2026-04-24
**Topic**: Fixing macOS "Damaged" errors, Bun JIT issues, and Sidecar path leaks in StockAI.

## 1. Problem Statement
StockAI's macOS distribution currently faces several "root-level" issues:
- **Gatekeeper Block**: Unsigned DMGs are marked as "damaged".
- **JIT Crash**: Bun-based sidecars require `allow-jit` entitlements to run correctly when signed or in a restricted environment.
- **Path Leakage**: Build machine absolute paths leak into the Bun sidecar binary, potentially affecting runtime path resolution and privacy.
- **CI/CD Gaps**: Lack of standardized signing/notarization infrastructure in GitHub Actions.

## 2. Goals
- Eliminate "damaged" errors (technical readiness for signing).
- Fix Bun JIT runtime issues via proper Entitlements.
- Ensure Sidecar binary purity (no leaked paths).
- Streamline GitHub Actions for production-grade releases.

## 3. Architecture Changes

### 3.1 macOS Security & Permissions
Create `src-tauri/Entitlements.plist` with the following keys:
- `com.apple.security.cs.allow-jit`: Essential for Bun's JIT compiler.
- `com.apple.security.cs.allow-unsigned-executable-memory`: Required for some native modules.
- `com.apple.security.cs.allow-dyld-environment-variables`: Required for Playwright/Bun environment overrides.
- `com.apple.security.network.client`: Standard network access.

### 3.2 Tauri Configuration (`tauri.conf.json`)
- Add `bundle.macOS.entitlements` pointing to the new plist.
- Add `bundle.macOS.signingIdentity` and other metadata placeholders.
- Consolidate `externalBin` and `resources` to ensure predictable paths within the `.app` bundle.

### 3.3 GitHub Actions Workflow (`release.yml`)
- Integrate `tauri-action` with standard macOS signing environment variables:
    - `APPLE_CERTIFICATE`
    - `APPLE_CERTIFICATE_PASSWORD`
    - `APPLE_SIGNING_IDENTITY`
    - `APPLE_ID`
    - `APPLE_PASSWORD`
    - `APPLE_TEAM_ID`
- Ensure sidecar builds happen before the Tauri bundle step.

### 3.4 Sidecar Build Script (`sidecar/build-script.ts`)
- **Bun 1.2 Adaptation**: Update logic to handle newer Bun compiler internal structures.
- **Aggressive Scrubbing**: Replace all machine-specific paths with `.`.
- **Integrity Check**: Automated grep of the output binary for forbidden strings (`Users`, `runner`, `work`).

## 4. Implementation Plan

1.  **Phase 1: Security Config**
    - Create `src-tauri/Entitlements.plist`.
    - Modify `src-tauri/tauri.conf.json`.
2.  **Phase 2: Sidecar Optimization**
    - Refactor `sidecar/build-script.ts` for purity and Bun 1.2.
    - Test local sidecar build.
3.  **Phase 3: CI/CD Pipeline**
    - Update `.github/workflows/release.yml` with signing support.
    - Add descriptive comments for secret setup.
4.  **Phase 4: Verification**
    - Run local integration tests.
    - Perform a manual build check for the sidecar.

## 5. Success Criteria
- Sidecar binary contains no absolute paths from the build environment.
- GitHub Actions pipeline is ready for "one-click" signed releases (pending secrets).
- App bundle contains correct Entitlements to prevent JIT-related crashes.
- Local `bun tauri build` works seamlessly with the new configuration.
