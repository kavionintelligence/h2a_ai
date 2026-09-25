# Phase 27 Guided Acceptance

## Purpose

Prove that four ceremony-bound agents collaborate through Context Broker disclosures and signed connector handoffs without receiving or persisting the full protected artifact.

## Preconditions

- Use the same `H2A_DATA_PATH` that contains the completed Phase 24 ceremony and Phase 25 bootstrap.
- Phase 26 must show all four lanes as `succeeded` on that ceremony trace.
- The Administrator / Approver must have a fresh Human Proof and active authority credential.
- The header trust ceiling must remain `Connected-observed ceiling`.

## Operator Procedure

1. Open **Context Broker** and locate **Phase 27 / Least-Context Collaboration**.
2. Click **Prepare Phase 27**.
3. Enter five genuine demonstration values. Use a unique restricted recovery sentinel that does not occur elsewhere in the workspace.
4. Click **Seal and issue grants**.
5. Confirm one protected artifact and four active grants appear. Each grant must have a different field/transformation pair and a 120-token budget.
6. Run the four handoffs in order: Claude, Antigravity, Framework, then Codex. Claude, Antigravity, and Codex invoke their installed official CLIs and can take up to 120 seconds each. Complete official login or consent if requested.
7. For each acknowledged lane, confirm the UI shows two released fields, three withheld fields, a projection hash, projected token count, predecessor-hash count, one grant use, execution kind, provider-output hash, and a signed acknowledgement.
8. Open the **Disclosures** tab and confirm the four durable receipts match the lane recipient, purpose, transformations, released fields, withheld fields, and projection hashes.
9. Open the **Messages** tab and confirm four signed governed handoffs are `delivered` and contain content references and hashes rather than response bodies.
10. Click **Prove fail-closed revocation**. Confirm `CONTEXT_GRANT_REVOKED`, a denial receipt, and `provider launch blocked` appear.
11. Close H2A completely, restart with the same data path, and confirm every lane, receipt hash, handoff ID, and revocation proof persists.
12. Open **Demo Gate**, click refresh, and confirm **Context minimization** is ready while trust remains connected-observed.

## Automated Evidence

Run:

```powershell
pnpm test:phase27
```

The suite covers ordered orchestration with deterministic provider ports, distinct grant rules, bounded projection metadata, predecessor hashes, durable restart recovery, revocation denial, recipient/purpose enforcement, expiry, forgery, replay, and leakage scans. Official CLI execution is intentionally accepted through the guided operator procedure, not fabricated by an automated test.

## Acceptance Boundary

Phase 27 is complete only after automated tests pass and the operator confirms the restart and Demo Gate checks. No test or UI action raises the runtime above the connected-observed trust ceiling.

## Completion Record

- Completed on 2026-08-22 against ceremony `ceremony_c3ad55dc-a544-4b51-958a-0583c80b5902` and shared trace `phase22_234eca22-ff97-4764-891b-763af7e2d82b`.
- Four ordered Claude, Antigravity, framework, and Codex handoffs were acknowledged with recipient-specific value, mask, summarize, and reference projections.
- Disclosures persisted released/withheld field names, transformations, projection hashes, and `values excluded`; governed messages persisted content references and hashes rather than response bodies.
- Revocation denial `disclosure_14368b7e-b971-4754-849d-1d40604b1d82` recorded `CONTEXT_GRANT_REVOKED` and provider launch blocked.
- Same-path restart preserved all four lanes, acknowledgements, hashes, handoff IDs, and revocation proof.
- Demo Gate resolved Context minimization as ready with four linked evidence records while trust remained `Connected-observed ceiling`.
