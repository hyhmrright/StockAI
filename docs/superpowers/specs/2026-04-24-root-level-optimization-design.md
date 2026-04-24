# Design Spec: Root-Level Architecture & CI Optimization (Bun 1.2 + Tauri 2.0)

**Date**: 2026-04-24
**Topic**: Transitioning from superficial binary scrubbing to root-level path management and robust CI verification.

## 1. Problem Statement
StockAI currently uses a "brute-force" approach to clean absolute paths from its Bun-based sidecar. While effective for some releases, it is fragile, relies on manual string manipulation of binaries, and doesn't fully guarantee compatibility with macOS Gatekeeper and Hardened Runtime requirements.

## 2. Goals
- **Sidecar Purity**: Use Bun's native features (`Bun.main`, `--embed`, `--minify`) to eliminate absolute path leaks at the source.
- **Macos Security**: Ensure Sidecars are pre-signed with Hardened Runtime options before bundling.
- **CI Reliability**: Implement automated Gatekeeper simulation inside GitHub Actions to prevent broken DMGs from being released.
- **Code Cleanliness**: Simplify `build-script.ts` and `BrowserManager.ts` by following official best practices.

## 3. Architecture Changes

### 3.1 Sidecar Path Resolution (Bun 1.2 Best Practices)
- Refactor `sidecar/browser-manager.ts` and `sidecar/utils.ts` to use `Bun.main` for determining the executable's location.
- Use `import.meta.dirname` for internal pathing within the sidecar bundle.
- Use `$bunfs` virtual paths for accessing embedded assets.

### 3.2 Asset Management
- Embed `sidecar/browsers.json` directly into the binary using the `--embed` flag.
- Remove redundant external copies of `browsers.json` in `tauri.conf.json`.

### 3.3 Build & Signing Process
- **`sidecar/build-script.ts`**:
    - Remove temporary directory usage.
    - Implement `codesign` step with `--options runtime` for macOS builds.
    - Use Bun's built-in minification to naturally obfuscate source paths.
- **`src-tauri/tauri.conf.json`**:
    - Set `"hardenedRuntime": true`.
    - Ensure `Entitlements.plist` includes `com.apple.security.cs.disable-library-validation`.

### 3.4 CI Verification (`.github/workflows/release.yml`)
- Add a new "Verification" step after the build completes:
    1. Mount the generated `.dmg`.
    2. Run `spctl --assess --verbose` against the contained `.app`.
    3. Run `codesign --verify` on the sidecar inside the bundle.
    4. Fail the workflow if any check fails.

## 4. Implementation Plan

1.  **Phase 1: Code Refactor**
    - Update `sidecar/browser-manager.ts` to use `Bun.main` and `$bunfs`.
    - Modify `sidecar/index.ts` to ensure compatibility with Bun 1.2.
2.  **Phase 2: Build Script Update**
    - Refactor `sidecar/build-script.ts` to use `--embed` and add the `codesign` pre-signing logic.
3.  **Phase 3: Configuration & CI**
    - Update `tauri.conf.json` and `release.yml`.
    - Add the automated DMG verification step.
4.  **Phase 4: Validation**
    - Run a full local build simulation.
    - Verify sidecar purity using `strings` or `grep`.

## 5. Success Criteria
- Sidecar binary contains no build-machine absolute paths without relying on manual "scrubbing".
- Sidecar binary is signed with `Hardened Runtime` enabled.
- GitHub CI automatically detects and blocks "Damaged" app bundles.
- Application successfully launches and detects either embedded browsers.json or system browsers.
