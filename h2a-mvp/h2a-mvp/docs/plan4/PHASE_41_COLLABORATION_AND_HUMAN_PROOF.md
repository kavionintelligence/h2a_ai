# Phase 41: Collaboration, Federation, And In-Place Human Proof

## Status

Engineering implementation and automated acceptance are complete. Phase 41 remains operator-open until one real proof-gated command is completed in each presentation mode with the enrolled person and current camera pipeline.

## Canonical Collaboration

The control-plane snapshot loads Phase 26 collaboration, Phase 27 least-context disclosures, Phase 28 approval routing, Phase 29 federation receipts, and Phase 39 runtime attachments from their persisted services. Office collaboration signals and entities retain canonical IDs, output hashes, released/withheld field names, and predecessor hashes. They never contain protected field values, provider response bodies, credentials, biometric frames, templates, distances, or BCH tokens.

Remote portals are derived from trusted peer state and denial receipts and can report `offline`, `active`, `replay-blocked`, or `revoked`. The operator surface reports host identity, cursor, observer count, input owner, and connected/recovering/stale/read-only state. Only Electron IPC and signed loopback A2A are enabled; WebSocket, remote A2A, and mobile transports are explicitly disabled.

## Human Proof Challenge

Both Control and Office use one host-owned challenge contract. A challenge binds:

- challenge ID and version;
- exact human, purpose, and protected command;
- source route and presentation mode;
- safe focus target and scroll position;
- continuation policy and operation key;
- sensitivity, request time, and expiry.

The dialog reuses the existing camera, capture policy, live distance feedback, configured liveness mode, ArcFace/BCH matching, proof signing, and evidence persistence. The host independently resolves the issued proof and rejects wrong subject, wrong purpose, stale route/mode, replay, expiry, or supersession.

Successful proof completion first refreshes the canonical host snapshot. The dialog closes only after that version is observable, then restores scroll and focus. Refresh-only sensitive commands remain operator-confirmed. Explicit non-sensitive exact-once continuations use host-side replay protection.

Concurrent challenges are deduplicated or queued. Cancellation, camera denial, mismatch, expiry, disconnect, and renderer reload cannot execute a protected effect. A renderer reload keeps a stable session client ID, reattaches to the same host challenge, and safely resumes input ownership without duplicate observers.

When no person is enrolled, the system cannot open a verifier. It preserves the earlier enrollment prerequisite behavior by opening Human Proof in Control mode with a reversible workflow detour.

## Automated Evidence

- `pnpm test:phase41`: 7 files, 21 tests passed.
- Exact binding, wrong-human, wrong-purpose, stale, replay, expiry, supersession, duplicate click, queue, cancel, detach/reattach, at-most-once, sensitive confirmation, capability negotiation, notification deduplication, and disabled transport tests passed.
- Phase 27, 28, and 29 regressions passed inside the Phase 41 suite.
- Electron proof overlay, reload recovery, Escape cancellation, underlying-dialog preservation, page-error, and horizontal-overflow tests passed at 390x844, 768x1024, 1024x768, and 1440x900.
- Screenshots are stored under `docs/plan4/evidence/phase41/`.
- Carried Phase 33-40 suites passed after Phase 41 integration.

## Guided Operator Test

1. Start H2A with the retained real demonstration data path.
2. In Control mode, open a protected command that names an enrolled person and purpose.
3. Confirm the Human Proof dialog appears over the same route; cancel it once and confirm no effect executes.
4. Reopen it and complete the real camera verification. Confirm the dialog closes, eligibility updates automatically, and route, form, selection, scroll, and focus remain intact without Refresh.
5. Switch to Office mode and repeat with a proof-gated guided action. Confirm the same behavior and canonical proof ID/evidence.
6. During one pending challenge, reload the renderer. Confirm the dialog is restored or safely invalidated, the host status returns to connected, and no protected effect executes before verification.
7. Confirm trust remains `Connected-observed ceiling`.

Phase 41 may be marked complete only after steps 2-7 are confirmed by the operator. Required-liveness final acceptance remains owned by Phase 44.
