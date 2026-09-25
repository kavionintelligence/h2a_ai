# Phase 30 Security Validation And Containment

Updated: 2026-08-23 Asia/Calcutta

## Purpose

Phase 30 proves that H2A rejects six adversarial requests at their owning service boundaries and contains real supervised child processes. A control passes only when its canonical ledger event is present on the active ceremony's shared `phase22_` trace.

The trust ceiling remains `connected-observed`. Docker isolation remains feasibility evidence and is not presented as active runtime governance.

## Implemented Boundaries

| Control | Public boundary | Required evidence |
| --- | --- | --- |
| Replay | `MandateService.authorize` with a repeated idempotency key | `POLICY_DENIED / REPLAY_DETECTED` |
| Forged approval | `MultiHumanApprovalService` organization-key signature verifier | `APPROVAL_INVALIDATED_V2 / APPROVAL_SIGNATURE_INVALID` |
| Over-broad delegation | `MandateService` attenuation policy | `DELEGATION_DENIED / CHILD_EXPANDS_PARENT_AUTHORITY` |
| Context leakage | `ContextBrokerService.authorize` with a field outside the grant | `CONTEXT_DISCLOSURE_DENIED` |
| Federation tamper | `FederationService.receiveEnvelope` with a mutated signed envelope | `FEDERATION_ENVELOPE_REJECTED` with hash/signature reason |
| Provider failure | `ProcessSupervisor` real child process exiting with code 17 | `LIVE_RUNTIME_FAILED / PROVIDER_EXIT_NONZERO` |
| Operator cancellation | supervised long-running child process | `LIVE_RUNTIME_CANCELLED` and terminated process tree |
| Authority revocation | runtime-session revocation against a running process | `LIVE_RUNTIME_REVOKED` and terminated process tree |
| Restart recovery | armed running record recovered during app initialization | `LIVE_RUNTIME_FAILED / HOST_PROCESS_RESTARTED` |

## Guided Operator Test

1. Launch H2A with the Phase 23 ceremony data path and open **Demo Gate**.
2. Find **Phase 30 / Security Validation** and confirm the ceremony and shared trace match Phases 24-29.
3. Run the six attack cards individually. Each must show `blocked`, a reason code, and an `evt_` evidence reference.
4. Run **operator cancel**. Confirm it reports `passed / OPERATOR_CANCELLED:PHASE30_OPERATOR_CANCEL`.
5. Run **authority revocation**. Confirm it reports `passed / PHASE30_AUTHORITY_REVOKED`.
6. Run **restart recovery**. It must show `armed`; close H2A completely without running another Phase 30 process.
7. Restart with the same `H2A_DATA_PATH`. Confirm restart recovery reports `passed / HOST_PROCESS_RESTARTED`.
8. Refresh Demo Gate. Confirm all six adversarial matrix rows are blocked, runtime containment passed, restart recovery passed, ledger integrity is verified, and trust remains `Connected-observed ceiling`.
9. Export only after the Demo Gate reports the actual current status; a tampered ledger must prevent a passed package.

## Acceptance Boundary

Phase 30 is complete only after the guided operator test is recorded. Automated engineering readiness does not replace the live ceremony evidence.
