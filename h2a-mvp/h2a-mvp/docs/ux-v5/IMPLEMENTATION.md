# H2A Work Workspace - UX v5 Migration

Date: 2026-09-06
Status: First integration built and targeted tests passed. Not a completed v5 product or final HP acceptance.

## Approved Security Follow-Up

The owner approved named employee sessions and host enforcement after the initial integration below. The current entry screen is employee sign-in; retained Office/Control and the gallery workspace are now behind **Administrator console**. Signed local room membership and independently reviewed Memory have been added. Unsupported remote cancellation/revocation now fails closed rather than claiming a remote stop.

Read [Employee Access, Rooms, And Reviewed Memory](EMPLOYEE_ACCESS_AND_MEMORY.md) for the current contracts, button sequence, recovery behavior, automated coverage and remaining limitations. The sections below describe the earlier 13:15 migration snapshot; statements that no IPC/repository/authentication changes exist are historical, not the current implementation. Full department read remit, employee-scoped work execution, remote containment and final acceptance are still unfinished.

## Product Decision

The owner asked for a full redesign and delegated the privacy/layout decision to the implementer. Adopt a work-oriented interface, a meeting-style agent gallery, and progressive Plain / Authority / Proof inspection. Joining a room never expands authority or exposes previously private context. Agent gallery tiles are not human video calls, provider speech, or proof of model execution.

This is an additive migration of the existing local operator product, not an authorization rewrite disguised as a theme. Old Office and Control remain reachable until every capability has a tested equivalent. Enter with **Open Work workspace**, or the renderer URL parameter `experience=workspace`. This selection is URL presentation state, not an authority or evidence record. Use Proof > Open engineering console to return.

## Built In This Integration

- Four destinations: Work, Records, People & agents, Memory.
- Work lists use durable collaborative goals, not a fabricated activity feed.
- In-task Room, Plan, Context, Outputs, and Decisions views retain the same goal and graph IDs.
- Meeting gallery derives tiles from assigned agents and their accountable human owners. Focus and gallery controls change presentation only.
- Plain / Authority / Proof changes detail, never scope or permissions.
- New task form selects an explicit accountable person and a registered project, then calls the existing compose and propose APIs. A failed proposal retains the saved goal for retry.
- Exact-plan approval, individual Run and Cancel use existing typed APIs. Local mandate withdrawal has an explicit impact confirmation and uses the exact `revoke a mandate` proof purpose. Independent work is not inferred from visual ordering.
- Expired authority and unapproved or unsatisfied dependency states disable Run. The host remains the final authority on every command.
- Context permissions are labelled as planned permissions. Separate disclosure receipts match task, grant, agent and Passport on the same node; released/withheld field names and transformations are shown, never source values.
- Output hash presence is described as a recorded output, not proof of remote provider execution.
- Human-owned agent roster, departments and roles read existing organization and candidate records. Unknown remote human names remain unresolved identifiers.
- Projects and protected source metadata use existing project/context repositories.
- Existing organization, provider, connection, approval, context, integration, evidence, setup, and acceptance controls open in a native in-place dialog. The existing top-layer named Human Proof dialog is retained.
- Exact goal selection is passed to the existing graph editor, avoiding an accidental edit to the most recent unrelated goal.

## Not Yet Built Or Accepted

These are implementation gaps, not optional operator tests:

1. Authenticated employee sessions and host-enforced read remit by organization, team, department, record type, and restricted room. Current client is a trusted local operator view. No persona picker is treated as authorization.
2. Durable collaboration-room membership, invitation, lending, admission and exit policies. Current room is a view over one durable task, not a new membership/security object.
3. Reviewed reusable Memory publication, retrieval, expiry, revocation and provenance. The Memory destination explicitly remains unavailable. Persisted receipts are not labelled as learned knowledge.
4. Unified plain-language replacement of the retained technical setup and approval forms. Mounting them in place preserves functionality but is not full workflow simplification.
5. Safe host-owned Ask -> Plan -> Go continuation with review of material scope changes. Current approval and run remain separate; no sensitive auto-continuation was invented.
6. Backend distinction between nondelegable company boundaries and delegable requests, including explicit person-only routing. Existing escalation semantics are unchanged.
7. External organization import, supported connectors beyond the installed adapters, and role-specific administration/Investigation views.
8. Rich graph editing, multi-person live presence, and genuine remote provider result provenance. No WebRTC/video/audio transport is claimed.
9. Complete migrated control inventory, cumulative release verification, full accessibility and nontechnical-user click-budget acceptance.

Review finding: the existing `apps/desktop/main/index.ts` work-graph `revokeNode` port calls mandate lifecycle enforcement for local nodes, but its paired-node branch records a local event without sending a remote containment command. The new workspace therefore exposes mandate withdrawal only for local assignments. This is not proof of remote stop; complete that backend protocol and negative tests before demonstrating remote revocation enforcement.

The earlier Plan 4 Phase 44 / Plan 5 Phase 51 operator requirements remain open. This migration neither closes nor weakens required liveness, independent approval, provider consent, two-node confirmation, containment, restart, complete trace reconstruction, and package verification.

## Next Implementation Order

1. Finish and accept this read/command integration, including no stale regressions, empty states, selected-task editing and responsive interactions.
2. Add authenticated host principals and explicit read-remit contracts, projection filtering and negative cross-team tests before offering employee-specific views.
3. Introduce durable room membership and cross-team lending with admission-time context checks. A person or agent joining cannot inherit another owner's authority.
4. Replace retained forms with bounded contextual workflows and purpose-bound host continuations; keep all old routes until parity passes.
5. Implement Records lifecycle and Memory publication/retrieval with signed provenance, classification, consent and revocation.
6. Finish investigation, connections and administration; retire legacy presentation only after complete functional parity and final operator acceptance.

## Files And Boundaries

| File | Responsibility |
| --- | --- |
| `apps/desktop/renderer/src/features/workspace/WorkspaceExperience.tsx` | Unified navigation, gallery, forms, records, roster, depth, contextual panels |
| `apps/desktop/renderer/src/features/workspace/workspaceModel.ts` | Read-only naming, state, expiry, dependency, disclosure and exact-purpose actor projections |
| `apps/desktop/renderer/src/features/workspace/workspace.css` | Scoped, responsive design tokens and layouts |
| `apps/desktop/renderer/src/App.tsx` | Canonical snapshot integration, host refresh, shared dialogs, reversible migration entry |
| `apps/desktop/renderer/src/features/command-floor/components/GoalWorkGraphPanel.tsx` | Optional exact-goal editor targeting; legacy behavior preserved |
| `tests/workspace-ux.test.ts` | Projection and safety checks |
| `tests/electron-workspace-ux.test.ts` | Disposable-root production Electron navigation, layout and restart tests |

No new runtime repository, credential, IPC channel, authority grant, biometric setting, provider flag, package dependency, or telemetry was added.

## References And Licensing

Read `C:/Users/khatr/Downloads/H2A_UX_Wireframe_Spec_v5.md` for the object model, shell, room, authority, migration and honesty requirements. The owner's explicit meeting-style request supersedes the document's conversation-first room mockup. UI screenshots supplied on 2026-09-06 inform layout only: workflow library, workflow nodes, context graph, Zoom-style gallery, employee profile, and composite H2A concepts. No reference image, vendor logo, screenshot asset, source code, or product claim is copied into production. Existing lucide-react supplies icons.

The spec's blanket competitor limitations and claims that H2A observes every action on every external platform are not adopted. Enforcement and visibility claims must be bounded by the connected adapter and actual evidence.

## Operator Walkthrough After Automated Checks

1. Start the existing app on the intended data root; select **Open Work workspace**.
2. Open a real existing task from Work; confirm its name, owners, node count and statuses match Control.
3. Use Room, Plan, Context, Outputs and Decisions without changing the task. Switch Plain / Authority / Proof; verify the same IDs and output hashes.
4. Focus an agent, then return to gallery. Do not describe these tiles as live video or agent speech.
5. From a disposable approved task, run one permitted node and cancel only a genuinely running assignment. Inspect persisted lifecycle evidence after restart.
6. Open People & agents; verify each known agent is under its actual owner. Do not use this local operator view as evidence of department read isolation.
7. Open a contextual approval or setup panel and trigger a real named Human Proof. Confirm cancellation is safe and successful proof updates the host state.
8. Use Records for project/source metadata; verify raw protected values are absent. Memory must remain labelled unavailable until its service exists.
9. Repeat keyboard, focus, 390px, tablet and desktop checks. Complete physical-person and provider checks only with the real operator.

Screenshots named `*-test-only.png` are automated layout artifacts from a disposable unapproved plan. They are not customer work, provider output, biometric acceptance or demonstration acceptance evidence.

For the actual button sequence and bounded demo claims, use `WORKSPACE_DEMO_WALKTHROUGH.md` in this directory.

## Verification Snapshot

- Typecheck, focused ESLint, production build and production-surface scan passed.
- Eleven domain/projection suites passed: 53 tests. The final workspace unit rerun passed all five tests.
- Final Electron workspace test passed with same-root restart, byte-identical persisted graph, gallery focus, keyboard/panel focus, no overflow/clipped buttons at 390, 768 and 1440 pixels, and all five room tabs. Fifteen test-only screenshots were captured.
- Legacy Office-native test passed on isolated rerun after an initial drawer-click timeout; this is recorded as flakiness, not erased.
- Repository-wide lint remains blocked by 54 existing demo-recorder/generated-demo `no-undef` errors. Full control inventory and cumulative release acceptance have not passed.
- These checks do not replace real provider execution, human verification, employee isolation or remote containment acceptance.
