# Phase 28 Guided Acceptance

## Purpose

Prove that a protected Claude action pauses for missing authority, routes only to a different eligible employee, accepts an exact-purpose biometric decision, and executes the frozen effect exactly once under a signed zero-delegation child mandate.

## Preconditions

- Use the same `H2A_DATA_PATH` and active Phase 24 ceremony used for Phases 25-27.
- Phase 27 must remain `revocation-proved` and Demo Gate Context minimization must remain ready.
- Claude Passport, runtime session, mandate, assignment projection, and official CLI authentication must remain active.
- The header trust ceiling must remain `Connected-observed ceiling`.

## Operator Procedure

1. Open **Authority Inbox** and locate **Phase 28 / Cross-Human Authority**.
2. If **Configure Phase 28** is disabled, open **Human Proof**, select `vcbv` (Administrator / Approver), verify for the purpose already displayed, return to Authority Inbox, and click refresh.
3. Click **Configure Phase 28** once. Confirm the panel shows the active ceremony, shared `phase22_` trace, status `ready`, a policy ID, assignment ID, and Context Grant reference.
4. Click **Verify requester**. In Human Proof select **Demo Employee**, verify for the exact purpose `request restricted findings publication`, return to Authority Inbox, and click refresh.
5. Click **Route protected action**. Confirm the protected `findings.publish` assignment moves to approval and a request appears below with the same effect hash, mandate, task, and review grant shown in the Phase 28 panel.
6. Select `vcbv` as the eligible employee. Click **Verify exact purpose**, verify `vcbv` for `approve restricted findings publication`, return, and click refresh.
7. Select `vcbv` again and click **Approve**. Confirm one signed decision and one narrow child mandate appear and **Resume once** becomes available.
8. Click **Resume once**. Wait for the official Claude process to finish. Confirm Phase 28 becomes `completed`, shows one run ID and output hash, and the assignment is complete.
9. Click **Resume once** again only if the control remains visible. Confirm no second provider run or second output is created.
10. In the Phase 28 panel click **Verify requester**, verify Demo Employee for the same requester purpose, return, refresh, and click **Create rejection proof**.
11. Select `vcbv`, verify the exact approval purpose, then click **Reject**. Confirm the request is terminally rejected, Phase 28 shows `completed-with-rejection`, and no provider run is created for the rejection path.
12. Close H2A completely and restart with the same data path. Confirm the policy, two requests, signed decisions, child mandate, primary run ID/output hash, replay-safe resume, and terminal rejection persist.
13. Open **Demo Gate**, refresh, and confirm **Authority escalation** is ready while trust remains connected-observed.

## Negative Evidence

The automated suite covers requester self-approval, ineligible employees, wrong-purpose proof, terminal rejection, expired authority, quorum, replay-safe resume, and approval-only mandate actions. The public ceremony adds genuine cross-human biometric proof and real official-provider execution.

## Automated Evidence

```powershell
pnpm test:phase28
```

## Acceptance Boundary

Phase 28 remains pending until the public two-human procedure, exactly-once retry, rejection path, restart persistence, and Demo Gate recognition are confirmed. Runtime trust remains `connected-observed`; successful CLI execution does not claim sandbox-governed execution.
