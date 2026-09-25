# Phase 37 - Truthful Live Office Projection

Status: Complete

Date: 2026-08-26 Asia/Calcutta

## Result

Office mode now projects stable humans, Passports, providers, provider/framework agents, assignments, approvals, Context Grants, federation peers, enterprise traces, and security alerts from the Phase 34 canonical snapshot. The projection is derived in the trusted main-process service and is never persisted as a competing Office database.

Every entity carries a canonical primary ID, source domain, status, activity basis, related IDs, minimized authority chain, released context field names, provider health, output hash, reason code, evidence references, trace ID, and update marker. The renderer receives classifications and hashes, not biometric material, protected values, credentials, prompts, response bodies, private keys, or unrestricted terminal output.

## Truth Model

```text
canonical domain state + verified ledger + enterprise traces
                         |
                         v
              projectOfficeEntities
                         |
                         v
                 OfficeState v2
             /           |          \
            v            v           v
     Pixi signals   DOM roster   compact inspector
```

`activity_basis` has three values:

- `decorative`: placement and idle presentation only; never real work.
- `canonical-state`: queued, working, waiting, or handoff state currently present in canonical services.
- `persisted-evidence`: success, denial, revocation, cancellation, restart failure, or provider failure backed by one or more ledger event IDs.

The contract rejects persisted success without evidence. Denial/failure animation also requires persisted evidence. A completed assignment without both a durable output hash and matching evidence is projected as `warning`, never `succeeded`.

## Projection And Visual Behavior

- Agent desk lights and status bubbles use the canonical agent entity selected by stable runtime ID.
- Movement occurs only for non-decorative canonical work/wait/handoff targets; ordinary idle placement does not imply execution.
- Envelope indicators require a delivered governed-message handoff on the matching trace.
- Denial/revocation/failure indicators use exact persisted reason codes.
- `LIVE_RUNTIME_CANCELLED`, `LIVE_RUNTIME_REVOKED`, `LIVE_RUNTIME_FAILED`, `RUNTIME_EXECUTION_FAILED`, and `RUNTIME_EXECUTION_TIMED_OUT` records project directly into security alerts.
- Guided-bootstrap assignment IDs project from their own canonical bindings when they are intentionally absent from the collaboration workplace repository.
- The ticker remains idle when no canonical signal or movement requires it, and remains disabled for reduced motion, hidden documents, and offscreen scenes.

## Inspector And Parity

The Office inspector exposes the selected entity's canonical ID, kind, detail, provider health, trace, output hash, reason code, authority chain, authorized field names, and evidence links. Evidence links switch to the unchanged Control Evidence route only after the presentation preference command is available.

Host-level tests compare Office trace IDs, output hashes, reason codes, and evidence references with the same `ControlPlaneCanonicalState` before refresh, after refresh, and after host restart. The production Electron test creates two enrolled test identities and the complete Phase 25 organization/Passport/assignment graph through production services and UI controls, then proves the Office entity IDs, statuses, and activity classifications survive process restart unchanged.

## Security And Licensing

- Office status does not invoke providers, mutate authority, write evidence, or raise trust.
- Trust remains `connected-observed` or `unverified` exactly as projected by the control plane.
- Output bodies and protected context values are not part of `OfficeEntity`.
- Phase 37 uses the original H2A Pixi engine and CSS from Phase 36. No Munder-Difflin or Mosaic source, asset, branding, name, copy, or derived implementation was read, copied, transformed, or shipped.
- The existing Phase 36 prohibited-asset hash scan remains green after Phase 37.

## Acceptance

- `pnpm test:phase33`: signed 41-file/10-phase baseline verified; 3 files and 5 tests passed.
- `pnpm test:phase34`: production build; 3 files and 8 tests passed.
- `pnpm test:phase35`: production build; 4 files and 10 tests passed after the Phase 37 inspector expectation was aligned with canonical entity selection.
- `pnpm test:phase36`: production build; 2 files and 7 tests passed; 1 original declaration, 15 restricted hashes, 155 application files scanned, 0 violations.
- `pnpm test:phase37`: production build; 2 files and 5 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with zero findings.
- Every `OfficeEntityStatus` has an asserted visual mapping.
- Persisted run completion, operator cancellation, authority revocation, host restart, and provider failure were reconstructed from a real temporary hash-chained ledger.
- The Electron ceremony proved four production-created agents, four guided assignments, at least four Passports, no false assignment success, inspector evidence navigation, and restart persistence.
- Screenshots at `390x844`, `768x1024`, `1024x768`, and `1440x900` passed document-overflow checks and direct visual inspection. The desktop shell was corrected to a viewport height so a long canonical roster cannot push the Pixi floor below the first viewport.

Evidence is under `docs/plan4/evidence/phase37/`.

## Guided App Test

1. Launch H2A with a data root containing real canonical records and select Office.
2. Confirm the floor, entity roster, trust ceiling, evidence status, and active-signal summary match Control.
3. Select an agent, assignment, Passport, approval, grant, peer, trace, and alert when each exists; inspect its canonical ID and linked fields.
4. Run, cancel, revoke, or fail an authorized provider operation in Control, then return to Office and refresh. Confirm the status and exact reason are visible only after canonical state/evidence exists.
5. Select an evidence-backed entity and open its Evidence link. Confirm Control Evidence opens.
6. Restart with the same `H2A_DATA_PATH` and confirm IDs, statuses, hashes, reasons, and evidence links persist.
7. Confirm trust remains `Connected-observed ceiling` and that a completion without persisted evidence never animates or labels itself as success.

The non-credentialed Phase 37 checks above are automated. Live provider consent and physical camera acceptance are not prerequisites for this projection phase and remain owned by their later guided/final phases.

## Exit

The Office is a truthful real-time projection over H2A canonical state and persisted evidence, not a scripted success scene. Phase 38 may add guided next actions without changing this truth boundary.
