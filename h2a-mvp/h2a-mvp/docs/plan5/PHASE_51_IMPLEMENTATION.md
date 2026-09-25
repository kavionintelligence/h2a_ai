# Phase 51 Implementation

## Status

Implementation is complete. Automated acceptance must pass as a single release matrix, and the physical/operator ceremony remains open until performed. This document does not claim final HP demonstration readiness.

## Host-Owned Conductor

`DemonstrationConductorService` owns the durable state in `acceptance/demonstration-conductor.json`. Renderer controls submit strict `start`, `resume`, `retry`, or `cancel` commands with an idempotency key and expected canonical cursor. The host rejects stale commands, preserves terminal cancellation, marks an in-flight run interrupted after process restart, and reconstructs every step from canonical acceptance state plus ledger evidence.

There is no skip command and no mark-passed command. A passed acceptance gate without at least one source evidence reference remains incomplete.

Safe deterministic steps are limited to enabling required liveness, exporting an already-eligible signed package, and verifying that package plus an actual tamper-negative mutation. Consecutive safe steps run under one Start or Resume command. The conductor pauses for a physical person, exact Human Proof, provider consent, mutual trust, independent approval, security denial, external-machine action, or missing dependency.

## Canonical Surfaces

The same conductor object is included in the control-plane canonical snapshot. **Workspace → Security map → Continue HP demonstration** and **Control → Demo Gate** therefore show the same conductor ID, trace, cursor, active step, status, reason code, progress, and evidence references.

The next required human is named in the proof button. Non-proof boundaries open the existing canonical owning control. Completion is never inferred from navigation or renderer state.

## Evidence And Package Verification

The host records conductor started, resumed, paused, step-passed, interrupted, cancelled, and completed events on the ceremony trace. Package export remains fail-closed behind all 11 gates and Phase 44 readiness. `FinalAcceptanceService.verifyExportedPackage` reparses the exported v3 package, verifies its signature and hashes, performs a real content mutation, requires hash rejection, and persists separate verification and tamper-rejection receipts.

## Security Properties

- Employee login remains mandatory before either workspace is available.
- Renderer reload ends the employee session; re-authentication restores the host-owned challenge and conductor.
- Session synchronization uses a read-only host probe and authoritative snapshot.
- Escape cancels only the Human Proof layer and retains the protected action beneath it.
- Active agent sponsor proof can be refreshed in place without changing scope.
- Control IDs and click budgets are machine checked.
- Trust remains `connected-observed`; no remote containment or commercial-production claim is made.

## Primary Files

- `packages/evidence/src/demonstrationConductorService.ts`
- `packages/evidence/src/finalAcceptanceService.ts`
- `packages/contracts/src/demonstration-conductor.ts`
- `packages/contracts/src/final-acceptance.ts`
- `apps/desktop/main/index.ts`
- `apps/desktop/preload/index.ts`
- `apps/desktop/renderer/src/features/acceptance/FinalAcceptanceView.tsx`
- `apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx`
- `docs/plan3/CONTROL_REGISTRY.json`

## Remaining Acceptance

Run the operator procedure in `PHASE_51_OPERATOR_ACCEPTANCE.md`. Phase 51 and Plan 5 must remain operator-incomplete until every physical, external, and independent action is confirmed and the clean root produces the final signed package.
