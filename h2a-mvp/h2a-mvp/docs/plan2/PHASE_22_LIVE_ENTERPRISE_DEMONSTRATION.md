# Phase 22 - Live Enterprise Demonstration And Red-Team Gate

Status: acceptance evaluator complete; final ceremony execution is incomplete.

## Purpose

Phase 22 is the evidence-backed acceptance layer for the HP CTO/CISO demonstration. It does not replace identity, authority, Passport, approval, Context Broker, connector, runtime, federation, or Evidence V2 enforcement. It evaluates their persisted outputs and refuses to pass on UI state, labels, probes, or scripted claims.

## Implemented Boundary

- `FinalAcceptanceService` maintains the session manifest, evaluates eleven gates, classifies six required attacks, and exports `h2a.final-acceptance.package` records.
- `FinalAcceptanceState` fixes three required provider lanes, accepted framework kinds, two-human minimum, 20-70 biometric record policy, shared trace prefix, and `connected-observed` trust ceiling.
- The Electron main/preload API exposes read and minimized-export operations only.
- Demo Gate presents status, evidence counts, operator actions, attack outcomes, manifest, and shared trace without upgrading incomplete evidence.
- `test:phase22` reruns the acceptance evaluator plus real approval, context, federation, replay/tamper, cancellation, revocation, timeout, and restart controls.

## Fail-Closed Rules

1. All three provider runs and the external framework collaboration must succeed on the same `phase22_` trace.
2. Provider probes and prior unrelated traces do not pass the shared-task gate.
3. Runtime input minimization requires a Context Grant reference and persisted authorized disclosure on that trace.
4. Cross-human escalation requires a persisted approval decision and completed exact-once resume.
5. Attack gates require persisted Phase 22 denial/failure evidence with recognized event or reason codes.
6. Final reconstruction requires a complete Enterprise Evidence V2 trace, at least three output hashes, and a verified ledger.
7. Host CLIs remain `connected-observed`; Phase 22 does not claim container governance.

## Remaining Acceptance Events

- Record both deferred physical cross-person biometric rejection checks.
- Authenticate Gemini, or obtain the user's explicit recorded approval that Antigravity is the Google lane for this demonstration.
- Run Claude, Codex, the accepted Google lane, and one conformant framework participant on one shared trace.
- Have the second enrolled employee biometrically co-sign the exact paused action.
- Execute cancellation, revocation, restart, and all six red-team attempts under Phase 22 trace IDs.
- Export the final package only after Demo Gate reports `passed`.

## Deployment Audit Finding

The underlying Phase 12-21 controls have real implementations and direct tests, but the final ceremony is not yet fully reachable through the shipped Electron operator surface:

- Framework collaboration records can be written by `FrameworkConnectorService`, but no IPC or UI command currently executes and records that collaboration in the active demo session.
- Approval and over-broad delegation denial events currently generate service-owned `tr_approval_*` and `tr_delegation_*` traces, so the Phase 22 evaluator cannot count genuine attempts that require a `phase22_` trace.
- The active two-human session has not yet been populated with the organization, authority, Passport, runtime, Context Grant, approval, framework, federation, and shared provider records required for one reconstructable trace.

These are implementation and integration tasks, not operator ceremony steps. Physical cross-person checks, second-human biometric approval, and provider account consent remain genuine user actions and must never be fabricated.
