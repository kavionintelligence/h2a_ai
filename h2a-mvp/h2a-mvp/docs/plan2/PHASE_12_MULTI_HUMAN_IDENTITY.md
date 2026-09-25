# Phase 12 Multi-Human Identity V2

Date: 2026-08-21  
Status: Complete for phase sequencing under the user's explicit 2026-08-21 acceptance exception. Two physical cross-person camera rejection checks remain deferred in `LATER_TASKS.md` and remain required for the Final Plan 2 Gate.

## Implemented Boundary

The additive V2 identity path supports multiple organization-scoped employee identities without replacing the historical V1 demo records. Each employee owns an independently versioned enrollment and active Human Proof.

- enrollment accepts a policy-controlled set of 20 through 70 distinct live captures;
- every capture must pass face count, quality, liveness, and distance policy before BCH registration;
- protected BCH helper, token, salt, and `k2` material is isolated in the trusted-process biometric secret repository;
- public enrollment state contains protected-record references and hashes, never protected record bodies;
- re-enrollment creates a new version and revokes the previous active enrollment and token set;
- explicit revocation removes proofs bound to the revoked enrollment;
- three failed biometric or capture-policy attempts lock the employee identity for 60 seconds, after which successful verification restores active status;
- verification is subject-specific and binds organization, membership, enrollment version, policy hash, purpose, and one-use nonce into the signed proof;
- minimized evidence records decisions, hashes, version, purpose, and match count without raw biometric material.

## V1 Migration

The typed `migrateHumanIdentityV1ToV2` desktop API accepts an explicit organization and human-to-membership mapping. It reads and validates V1 envelopes without changing them, migrates only evidenced identity metadata, and writes Ed25519-signed receipts under `migrations/v2-human-identity-receipts.json`.

Legacy biometric enrollments are always recorded as `requires-enrichment`. Their 3-5 templates are never duplicated or promoted; the receipt requires a fresh 20-70 capture set, token-set policy, protected-record references, and enrollment version. Repeated unchanged migrations reuse the signed receipt and do not duplicate records or evidence.

## Calibration Boundary

`evaluateBiometricCalibration` compares required-match policies against labeled observations and calculates false-accept and false-reject rates. The checked-in report at `docs/plan2/evidence/biometric-calibration-synthetic.json` is generated from labeled synthetic fixtures exercised through the real BCH WASM codec.

The synthetic report validates threshold mechanics only. It remains `demo-unmeasured`, sets `production_claim_permitted=false`, and does not replace the real two-participant camera calibration required for a human accuracy claim.

## Runtime And UI

`HumanIdentityV2Service` is owned by the Electron main process. Typed IPC and the context-isolated preload expose state, enroll, verify, and revoke operations to the renderer. The Human Proof view provides an employee directory, new-employee enrollment form, 20/45/70 capture controls, current assurance state, verification result, and enrollment revocation.

The browser preview is useful for layout verification but cannot persist V2 identity state because that boundary exists only in Electron. Real enrollment and verification therefore run in the desktop application.

## Verification Completed

- two synthetic employees persist independently;
- Alice's biometric fixture verifies Alice and is denied against Bob's enrollment;
- duplicate enrollment samples, membership mismatch, and nonce replay fail closed;
- rotation prevents the older token set from verifying and revocation removes the active proof;
- three failed biometric attempts produce a timed lockout and verification recovers only after expiry;
- V1 identity metadata migrates only with explicit organization/membership context; signed receipts are cryptographically verified and unchanged reruns are idempotent;
- legacy biometric enrollment remains `requires-enrichment` and both source V1 envelopes remain byte-for-byte unchanged;
- the real BCH codec passes labeled synthetic genuine/impostor policy fixtures;
- the complete V2 service enrolls and verifies real BCH token sets at 20, 45, and 70 records;
- public state and evidence omit protected helper, token, and salt values;
- the complete suite passes with 67 tests across 16 files;
- typecheck, lint, and production build pass;
- 1440x900 and 390x844 UI checks show no horizontal overflow or application console errors.
- the live Electron ceremony contains two independent real-person 20-record enrollments and successful own-person verification for both identities;
- the user confirmed keyboard navigation, screen-reader announcements, camera-denial handling, and retry/recovery in the live Electron flow on 2026-08-21.

## Remaining Acceptance Gates

- perform and persist varun-against-kink and kink-against-varun rejection checks as recorded in `LATER_TASKS.md`;
- confirm that neither rejected cross-person attempt issues a proof for the claimed employee.

The user explicitly scheduled these cross-person checks for later and accepted Phase 12 as complete for sequencing on 2026-08-21. The checks remain mandatory Final Plan 2 evidence. No measured human biometric false-acceptance or false-rejection claim is made before the real two-participant labeled calibration and cross-person ceremony are complete.
