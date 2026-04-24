# Design Spec: macOS Root-Level Signing & Sidecar Optimization

## 1. Problem Statement
The current StockAI macOS distribution suffers from "Damaged" warnings. This is primarily caused by:
- **Nested Signing Gap**: Sidecar is ad-hoc signed, breaking the trust chain for notarization.
- **Path Leaks**: Absolute build-time paths in the sidecar binary trigger security flags.
- **Entitlements Mismatch**: Sidecar lack Hardened Runtime flags required for modern macOS.

## 2. Goals
- Ensure `StockAI_*_aarch64.dmg` passes all Gatekeeper checks without workarounds.
- Achieve 100% "pure" Sidecar binaries (no host path leaks).
- Automate deep signature verification in CI.

## 3. Proposed Changes

### A. Sidecar Build & Sign Pipeline (`sidecar/build-script.ts`)
- **Real-ID Signing**: Acceptance of `APPLE_SIGNING_IDENTITY` environment variable.
- **Entitlements Injection**: Apply `Entitlements.plist` directly to the sidecar during its build step.
- **Aggressive Scrubbing**: Enhance string replacement to cover escaped path patterns and Bun-specific internal buffers.

### B. CI Workflow Enhancement (`.github/workflows/release.yml`)
- **Secret Propagation**: Pass signing secrets to the `Build sidecar binary` step.
- **Pre-bundling Validation**: Add a `Verify Code Signature` step using `codesign -vvv --deep` BEFORE Tauri bundles the app.
- **Stapling Awareness**: Ensure `tauri-action` is configured for full notarization and stapling.

### C. Verification Tooling (`scripts/verify-bundle.ts`)
- **Signature Check**: Use `codesign` to verify identity and entitlements.
- **Gatekeeper Simulation**: Use `spctl` to check if the binary would be accepted by the OS.

## 4. Technical Architecture
```dot
graph TD
    A[Bun Build Sidecar] --> B[Scrub Absolute Paths]
    B --> C[Sign with Real Apple ID + Entitlements]
    C --> D[CI Signature Validation]
    D --> E[Tauri Bundle & Sign App]
    E --> F[Apple Notarization Service]
    F --> G[Staple Ticket to DMG]
```

## 5. Success Criteria
- `codesign -vvv --deep --strict StockAI.app` returns "valid on disk" and "satisfies its Designated Requirement".
- `spctl --assess --verbose /Applications/StockAI.app` returns "accepted".
- No absolute paths found in the binary via `grep`.
