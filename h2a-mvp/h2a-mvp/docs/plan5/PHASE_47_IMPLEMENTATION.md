# Phase 47 Implementation Record

## Status

Implementation-complete. Human-operated camera and ceremony acceptance is carried to Phase 51 under the operator-test deferral approved on 2026-09-01.

## Implemented

- Every in-place Human Proof challenge identifies the expected employee, exact purpose, command, employee ID, organization, department, and authority roles.
- The camera instruction names the expected employee and never infers identity from the captured face.
- The ceremony displays live face count, estimated distance, accepted range, image-quality and lighting guidance, liveness mode, capture progress, protected BCH matching progress, and signed-proof confirmation.
- Missing enrollment, biometric mismatch, wrong membership, nonce replay, lockout, camera denial, challenge expiry, stale proof, source change, and control-plane disconnect remain fail-closed with actionable guidance.
- The host retains exact subject/purpose challenge binding, deduplicates equivalent requests, queues distinct requests, rejects replay, and executes allowlisted continuations at most once.
- Office/Control mode, route, selection, scroll, and focus remain in place. Canonical state is refreshed after proof before the modal closes; queued challenges open before earlier focus is restored.
- Sensitive continuations require an explicit post-proof confirmation. Non-sensitive continuations close only after the signed-proof state is visible.
- Clean sessions state enrollment as a prerequisite and cannot issue proof without an active protected token set.

## Automated Evidence

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:phase47`
- Desktop screenshot: `docs/plan5/evidence/phase47/identity-explicit-proof-dialog.png`

## Deferred To Phase 51

- Correct-person and wrong-person physical camera ceremony.
- Camera permission denial and recovery with the operator's installed camera.
- Required-liveness verification with two physically present enrolled people.
- Human confirmation of focus restoration, screen-reader announcements, and supported-camera framing.
