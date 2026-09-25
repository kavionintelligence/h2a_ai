# Phase 25 Guided Operator Test

Status: Complete on 2026-08-22 Asia/Calcutta.

Use session `phase23-guided-20260821175015` and active ceremony `ceremony_c3ad55dc-a544-4b51-958a-0583c80b5902` / trace `phase22_234eca22-ff97-4764-891b-763af7e2d82b`.

## Before Starting

1. Open Human Proof and verify both enrolled humans. Complete the remaining steps within the five-minute proof window.
2. Keep liveness described as `demo-bypass`; the resulting proofs are substantial, not high assurance.
3. Open Demo Gate and confirm the Phase 24 ceremony and trace are unchanged.

## Guided Controls

1. In Phase 25, confirm the authority administrator is the existing authority-root human and the H2A operator is the other human.
2. Click **Validate two humans**. Confirm Human readiness is passed and both rows show a 20-record token set, model hash, fresh proof, and substantial assurance.
3. Click **Configure authority**. Confirm Authority becomes Separated and Organization authority passes.
4. Click **Create participants**. Confirm Workload identity passes and Participants shows `4/4`.
5. Click **Issue mandates and tasks**. Confirm Mandates and Assignments both show `4/4`.
6. Inspect People & Authority for separate operator and approver credentials.
7. Inspect Command Floor for Codex, Claude, Antigravity, and Framework agents and four linked assignments.
8. Inspect Mandates for one root and three bounded child mandates.
9. Inspect Evidence and confirm Phase 25 records use the active `phase22_` trace without unresolved required bootstrap links.

## Restart Checkpoint

1. Close H2A completely.
2. Relaunch with the same `H2A_DATA_PATH`.
3. Open Demo Gate and confirm the ceremony ID, shared trace, separated authority, Participants `4/4`, Mandates `4/4`, and Assignments `4/4` persisted.
4. Click **Confirm restart recovery**.
5. Confirm all five Phase 25 steps are passed and no new ceremony or trace was created.

## Negative Checks

- Selecting the same human in both roles must not allow validation.
- Letting either Human Proof expire before a mutating step must block continuation and instruct the operator to refresh both humans.
- A disabled later-step control must not bypass the ordered workflow.

## Recorded Result

- The user confirmed both real enrolled humans showed 20-record token sets and fresh substantial proof under the approved `demo-bypass` liveness posture.
- Human readiness, Organization authority, Workload identity, and Mandates and tasks all passed in order.
- Authority was separated between `vcbv` as administrator/approver and `Demo Employee` as operator.
- Participants, mandates, and assignments each reached `4/4`.
- The user closed H2A, restarted with the same data path, and clicked **Confirm restart recovery**.
- The same ceremony and trace remained active and the restart-recovery step became passed.
- No new ceremony, trace, preview agent, or preview success record was created.

Phase 25 guided acceptance is complete. Liveness remains `demo-bypass`, so this is substantial demonstration assurance and not high-assurance liveness evidence.
