# Phase 23 Product Surface Truth Audit

Date: 2026-08-21 Asia/Calcutta

Status: Engineering complete; guided operator confirmation pending.

## Purpose

Phase 23 makes the shipped desktop surface tell the truth about what is connected, what is a scripted rehearsal, and what still requires a later Plan 3 phase. It does not complete the Phase 22 enterprise ceremony.

## Audited Surface

- 10 production routes.
- 128 button declarations across 19 renderer source files.
- 70 matching preload/main IPC channels.
- Connected commands, local UI, read-only controls, scripted rehearsals, live connected-observed execution, and unavailable prerequisites.
- Production renderer output, development fixtures, biometric exports, runtime adapter exports, responsive layout, and clean-session startup.

The machine-readable source of truth is `CONTROL_REGISTRY.json`. Repeated controls produced from one declaration are represented as a control family; `source_coverage` preserves the exact declaration count for every source file.

## Implemented Changes

- Added stable `data-control-id` values to connected command controls.
- Moved rich preview state from production `App.tsx` to the development-only `dev/previewFixtures.ts` module.
- Added production-safe empty startup state in `stateDefaults.ts`.
- Replaced the fixed `Scripted workplace` header with state-derived runtime mode and trust posture.
- Removed the unused `MockHumanProofProvider` production export.
- Removed disabled V0 runtime adapters from the public agents package; scripted rehearsal retains an internal direct import.
- Classified preload APIs without direct renderer paths as parent-managed, migration/admin/test-only, or future-phase work.
- Fixed the tablet topbar overflow discovered by the Electron crawl.

## Truth Boundaries

- `settings.framework.execute` remains unavailable and is owned by Phase 26.
- `federation.envelope.exchange` remains unavailable and is owned by Phase 29.
- Scripted scenarios are labeled rehearsals and do not count as live provider evidence.
- Claude, Codex, and Antigravity execution remains `connected-observed`, not governed isolation.
- Phase 22 remains in progress until one shared cross-human, cross-provider, framework-connected ceremony passes all final gates.
- Preview fixtures are available only through development query states and are absent from the production renderer bundle.

## Automated Evidence

- `tests/product-surface-phase23.test.ts` verifies route/control coverage, stable command IDs, API/IPC parity, and mock/preview quarantine.
- `tests/electron-surface-phase23.test.ts` launches real production Electron against a clean isolated session and crawls every route at `390x844`, `768x1024`, `1024x768`, and `1440x900`.
- `scripts/verify-production-surface.mjs` rejects known preview identities, fake preview keys/signatures, preview traces, and mock markers in the built renderer.
- Forty route screenshots are stored in `docs/plan3/evidence/phase23`.

## Verification Result

- TypeScript: passed.
- ESLint: passed.
- Phase 23 gate: 5 of 5 tests passed; production bundle scan passed across 20 renderer files.
- Full single-worker regression: 120 passed, 4 credentialed tests skipped, 0 failed.
- Production Electron build: passed.
- Visual inspection: sampled mobile and desktop Command Floor, Settings, and Demo Gate states show no preview data, incoherent overlap, or misleading success state.

## Remaining Acceptance

The engineering and automated evidence gates are complete. The short user-guided walkthrough in `PHASE_23_GUIDED_OPERATOR_TEST.md` must be confirmed before Phase 23 is recorded as fully accepted and Phase 24 begins.
