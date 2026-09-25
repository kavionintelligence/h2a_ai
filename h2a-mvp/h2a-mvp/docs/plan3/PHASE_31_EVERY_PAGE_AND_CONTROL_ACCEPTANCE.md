# Phase 31 - Every Page And Control Acceptance

Updated: 2026-08-23 Asia/Calcutta

## Purpose

Prove that every visible H2A route and control is connected to a real local workflow, an honest prerequisite gate, or an intentionally read-only view. No control may be decorative, dead, or unclassified.

## Control Inventory

- 10 registered routes.
- 87 classified control families: 60 command, 13 live-connected, 8 local UI, 4 read-only, and 2 scripted-rehearsal.
- 179 renderer button declarations across 23 source files.
- 12 preload APIs with explicit operator-path classifications.
- Zero unclassified controls; the machine-readable source of truth is `CONTROL_REGISTRY.json`.

## Phase 31 Repairs

### Approval Withdrawal

Authority Inbox now exposes the existing withdrawal workflow. Withdrawal requires a fresh requester Human Proof for the exact purpose `withdraw protected approval request`, verifies the persisted requester membership, invalidates related authority, and records `APPROVAL_INVALIDATED_V2` with status `withdrawn`.

### Signed Connector Import

Settings now exposes connector import through the production registry. The operator supplies a strict Connector Manifest, publisher public key, and runtime public key. The main process verifies schema, canonical hash, Ed25519 publisher signature, and runtime binding before persisting the connector. The renderer displays imported records and never asks for or stores provider credentials.

### Accessibility And Responsive Surface

- Mandates uses one application-level `main` landmark and a labelled selected-mandate section.
- Native dialogs, button names, reduced-motion rendering, horizontal overflow, and button clipping are checked in production Electron.
- Forty screenshots cover every route at `390x844`, `768x1024`, `1024x768`, and `1440x900` under `docs/plan3/evidence/phase31/`.

## Automated Acceptance

Run:

```powershell
pnpm test:phase31
```

This performs the production build, sequential full Vitest regression, Phase 31 Electron route/control/restart tests, and the production marker scan. The Electron test creates an isolated local data root, never changes the active guided ceremony, imports a freshly generated publisher-signed connector, restarts, and verifies persistence.

Recorded result: 40 test files passed, 1 opt-in credentialed file skipped, 160 tests passed, 4 opt-in credentialed tests skipped, and `H2A_PHASE23_PRODUCTION_SURFACE_OK` confirmed 20 scanned renderer files. TypeScript and ESLint also passed.

## Guided Operator Acceptance

1. Launch the existing guided session and confirm the header still reports `Connected-observed ceiling`.
2. Open each route from Command Floor through Settings and exercise all controls that are safe in the current ceremony state.
3. Confirm disabled controls state their missing proof, authority, dependency, configuration, or authentication prerequisite.
4. In Human Proof, retain the two completed cross-person mismatch rejections, restore required liveness, and confirm one current same-person verification for each employee plus camera denial/retry.
5. In Authority Inbox, create a disposable pending request, verify the requester for `withdraw protected approval request`, withdraw it, and confirm the durable `withdrawn` record in Evidence.
6. In Settings, open Import signed connector and close it without submitting. The automated suite separately proves a valid signed import and restart persistence.
7. Close H2A, restart with the same `H2A_DATA_PATH`, and confirm route state, evidence integrity, runtime mode, and trust ceiling persist.
8. Confirm no control is left as failed or unexplained. Prerequisite-gated and intentionally read-only controls remain acceptable only when their reason is visible.

## Acceptance Boundary

Automated engineering acceptance does not substitute for camera or second-human evidence. The two cross-person checks and prior camera-denial/retry observations are recorded, but Phase 31 is complete only after required-liveness same-person verification and the disposable withdrawal workflow are confirmed. By product-owner decision on 2026-08-26, those two checks are deferred to Plan 4 Phase 44 so they run through the finished dual-view UI after the Phase 43 release freeze. Phase 29 replay-specific denial is complete and referenced by the Phase 33 reconciliation.
