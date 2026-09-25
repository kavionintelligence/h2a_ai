# Phase 42: Full Product Surface, Performance, And Accessibility Acceptance

## Status

Engineering implementation and automated acceptance are complete. Phase 42 remains operator-open because the carried Phase 41 real camera checks and the Phase 42 physical in-place Human Proof acceptance have not been confirmed by the operator. Plan 3 required-liveness and approval-withdrawal evidence remain owned by Phase 44.

## Control Registry

`docs/plan3/CONTROL_REGISTRY.json` is now schema version 2 and Phase 42 canonical. It covers all 221 renderer button declarations and 131 classified controls. Office camera controls, collaboration signals, notifications, evidence links, accessible entity fallbacks, presentation switching, terminal controls, and Human Proof request/cancel paths are no longer excluded from registry coverage.

Every Office collaboration signal carries a canonical `target_entity_id`. A signal with no resolvable target is visibly disabled instead of presenting a dead control. Office notifications with a canonical route are buttons that open the matching Control view; informational notifications remain non-interactive.

## Human Proof Quality

The shared dialog retains its modal label, explicit purpose description, focus trap, Escape cancellation, camera teardown on unmount, live distance and capture feedback, and source focus/scroll restoration. The host queue is bounded at 32 distinct challenges, duplicate clicks are deduplicated, and attachment growth is bounded to 256 host attachments and eight retained generations per client. Queue or attachment exhaustion fails closed with an explicit reason code.

The operator must still complete a real protected command in Control and Office, including cancellation, camera permission denial/recovery, successful verification, automatic canonical refresh, route/focus preservation, and renderer reload recovery. No automated capture is treated as physical acceptance.

## Local Diagnostics

Settings includes an ephemeral renderer diagnostics panel. It samples frame rate, p95 frame interval, Chromium JS heap when available, DOM node count, canvas count, Office ticker state, visibility, and sample time. The component has no H2A API call, IPC call, fetch, beacon, WebSocket, local storage, session storage, persistence, export, or telemetry endpoint. Sampling pauses while the document is hidden and is disposed on unmount.

## Resilience And Accessibility

- Twenty canonical agents remain deterministic through 500 scene-model projections.
- Stale cursors require a full snapshot after the bounded replay window.
- One hundred reconnects for one renderer retain one connected observer and input owner.
- A 257th simultaneous attachment is rejected rather than growing host memory without bound.
- Thirty-two distinct pending Human Proof requests are bounded; the next request is denied.
- Terminal output, per-session replay, pending bytes, leases, one input owner, cancellation, and restart recovery remain bounded by the Phase 39 service and regression suite.
- Office and Control pass Electron checks at 390x844, 768x1024, 1024x768, and 1440x900.
- Keyboard mode switching, accessible names, status announcements, reduced motion, button text fit, document overflow, canvas readiness, renderer reload, and page-error checks pass.
- Evidence screenshots are under `docs/plan4/evidence/phase42/`.

## Automated Evidence

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test:phase42`: 9 files, 28 tests passed after a production Electron build.
- Additional carried Phase 33/35/37/38/40 verification: 10 files, 28 tests; two stale acceptance assertions were corrected and the two affected tests then passed.
- Phase 33 signed baseline verification now permits monotonic registry growth while rejecting missing phases, completed-phase regression, or shrinking numeric checks.
- Phase 37 Electron acceptance reads the canonical persisted participant/assignment state after a guided route transition rather than relying on text from the prior route.

## Operator Exit Check

1. In Control, start a representative proof-gated command, cancel once, then complete it with the enrolled person and real camera.
2. Confirm camera denial and Retry camera recover without navigation.
3. Confirm live distance, required range, face count, image quality, and configured liveness state are announced and visible.
4. Confirm the dialog closes only after canonical eligibility refreshes and source route, form, scroll, selection, and focus remain intact.
5. Repeat in Office through a guided protected action.
6. Reload during one pending challenge and confirm safe restoration or invalidation with no protected effect.
7. Confirm Office and Control show identical canonical IDs, statuses, hashes, reason codes, and `Connected-observed ceiling`.
8. Leave Phase 42 open if any check is not confirmed.

