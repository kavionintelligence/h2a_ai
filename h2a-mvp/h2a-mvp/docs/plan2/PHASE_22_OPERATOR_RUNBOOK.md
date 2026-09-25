# Phase 22 Operator Runbook

## Preconditions

1. Start from a dedicated demo session: `pnpm demo:new-session`.
2. Start H2A: `pnpm dev`.
3. Confirm Evidence is verified and Demo Gate is blocked rather than failed.
4. Confirm Claude, Codex, and the selected Google lane are authenticated through their official local surfaces.
5. Keep every host CLI labelled `connected-observed`.

## Ceremony

1. Enroll Employee A and Employee B independently with 20-70 records each.
2. Perform both deferred cross-person checks: A against B's selected identity, then B against A's. Both must reject.
3. Create distinct operator and approver memberships, roles, and active credentials.
4. Issue provider Passports V2, prove each workload key, and establish active runtime sessions.
5. Create one task and use a trace beginning `phase22_` for Claude, Codex, the Google lane, and one conformant framework agent.
6. Issue bounded Context Grants and verify actual disclosures before provider execution.
7. Allow one in-authority action. Route one missing-authority action to Employee B.
8. Employee B reviews the exact effect, verifies biometrically for the stated approval purpose, signs, and resumes once.
9. Cancel one actual run and revoke a mandate, Passport, binding, or session before the next action.
10. Run replay, forged approval, over-broad delegation, context leakage, envelope tamper, and provider-failure attempts using the same Phase 22 trace prefix.
11. Restart H2A with an active run and confirm it becomes failed with `HOST_PROCESS_RESTARTED`, never succeeded.

## Acceptance

Open Demo Gate and refresh. Do not proceed on a `failed` ledger. `ready` means a shared trace exists but one or more gates remain incomplete. Only `passed` satisfies Plan 2.

Export the acceptance package from Demo Gate. Record its SHA-256 hash and relative path in the demonstration report. The package contains references, reason codes, statuses, and hashes; it excludes biometric material, prompt/output bodies, context values, credentials, and private keys.

## Recovery

- Authentication failure: authenticate in the official provider client, probe again, and retain the failed run evidence.
- Camera denial: restore browser camera permission and retry; never substitute a scripted proof.
- Provider failure: retain the failed run, correct the provider setup, and rerun under the same task with a new run ID.
- Evidence integrity failure: stop the demonstration and preserve the data folder for investigation.
- Operator interruption: restart H2A, confirm orphan recovery, then continue from persisted state.
