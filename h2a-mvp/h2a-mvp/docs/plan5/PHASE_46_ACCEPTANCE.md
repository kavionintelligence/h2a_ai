# Phase 46 Acceptance - Proactive Readiness And Exact-Scope Repair

Status: Automated acceptance passed. Guided operator acceptance is required before Phase 46 can be marked complete.

## Implemented Product Behavior

- Office and Control receive one host-owned readiness projection over Human Proof, membership, authority credential, Agent Passport, runtime session, runtime attestation, mandate, assignment, Context Grant, provider, federation peer, approval, validation, evidence integrity, and control-plane attachment.
- A protected command is classified before launch as `ready`, `expiring`, `expired`, `revoked`, `authentication-required`, `dependency-missing`, `approval-required`, or `disconnected-read-only`.
- Repairable commands expose one grouped exact-purpose Human Proof action. Provider authentication and independent approval remain external actions.
- Credential, session, attestation, mandate, assignment, and grant repairs preserve or narrow every scope dimension. Revoked records remain immutable.
- Successful continuation refreshes the canonical projection automatically and restores the originating Office or Control context without a manual refresh.
- Technical details expose record IDs, status, expiry countdown, exact scope, scope hash, and the original reason code.

## Guided Operator Acceptance

Use a disposable copy of a real session, or the current demonstration session when its expiring and revoked records are already non-ready. Do not alter timestamps or JSON files.

1. Open Office and locate **Command readiness - Repair before run**.
2. Confirm at least one provider or context command reports the expired proof, credential, mandate, attestation, or grant before **Run** is attempted.
3. Open **Technical details** and record the command ID, affected record IDs, expiry, reason code, scope summary, and scope hash.
4. Click **Repair prerequisites** once.
5. Confirm one Human Proof challenge opens for the named exact purpose `repair prerequisites for <command label>`.
6. Complete the requested real Human Proof. Do not navigate to Human Proof and do not press a page refresh control.
7. Confirm the dialog closes, the original page updates automatically, and the command becomes ready when every prerequisite was repairable.
8. If provider login, a dependency, or independent approval remains, confirm it stays explicit and the application does not claim the command is ready.
9. Reopen **Technical details**. Confirm replacement record IDs differ, exact scope and scope hash are unchanged or narrower, expiry is no longer non-ready, and no prior revoked record became active.
10. Switch Office to Control and confirm the same command status, IDs, reason code, trust ceiling, and replacement state.
11. Open the revoked federation peer readiness item. Confirm it is blocked, says the old relationship is immutable, and offers a replacement pairing route instead of a reactivate action.
12. Through the existing signed federation workflow, create a new peer relationship. Confirm the new peer has a new ID and key pin while the old peer remains revoked.
13. Close and restart H2A on the same data root. Confirm repaired references and the revoked/replacement peer lineage persist.

## Click Budget

- Exact-scope repair: one **Repair prerequisites** command.
- Required security pause: one Human Proof submission.
- Manual refreshes: zero.
- Provider login, independent approval, and mutual peer confirmation are excluded mandatory pauses and are never automated.

## Automated Evidence

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test:phase46`: 20 files and 70 tests passed.
- Phase 45 baseline: 142 controls and 8 journeys verified.
- Production surface: 28 renderer files verified.
- Phase 36 asset provenance: 1 original asset, 15 restricted hashes, and 185 files verified.
- Signed release inventory: 284 files verified.
- Release files hash: `sha256:bb6a124f9cfd12ebb8bb3ee926cf59e16248c4b98c516fe92efed7b003edb846`.
- Release payload hash: `sha256:0b0402d2870ccc153a604f3c6b5de93f711ba892835988fe96ec21c097f25ffe`.

## Decision

Do not mark Phase 46 complete until the operator confirms steps 1-13. Phase 44 remains operator-open and trust remains `connected-observed`.
