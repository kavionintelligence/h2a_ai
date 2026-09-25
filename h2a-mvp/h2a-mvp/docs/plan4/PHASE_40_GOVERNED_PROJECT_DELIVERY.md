# Phase 40 - Governed Multi-Agent Project Delivery

Status: engineering complete; guided operator acceptance pending.

## Delivered Architecture

- `@h2a/projects` owns one atomic project-delivery repository, a persisted Ed25519 signing key, canonical Git registration, signed goals and assignments, worktree leases, governed research, validation, provider supervision, and human-approved integration.
- `ProjectDeliveryState` is part of `ControlPlaneCanonicalState`. Office and Control therefore reattach to the same snapshot generation, cursor, and canonical hash; no Office-only project repository exists.
- Editing assignments receive separate Git branches and worktrees. They bind an agent runtime binding, Passport, live session, mandate, path patterns, command IDs, network hosts, output contract, dependencies, and provider.
- Claude, Codex, and Antigravity profiles retain provider review and workspace-write/sandbox controls. H2A never uses broad bypass flags and never raises trust above `connected-observed`.
- Provider prompts and raw output are transient. Durable runs retain hashes, status, reason, process ID while active, timestamps, and repository delivery evidence. A successful exit without a real scoped diff is rejected.
- Governed research accepts only registered HTTPS hosts or loopback test sources, caps response size, and signs URL, retrieval time, classification, excerpt, and content hash. Dependent assignments receive signed minimized source-package records.
- Final integration calculates its effect from sorted assignment IDs and current binary Git diff hashes. `Route exact approval` persists an Ed25519-signed review bundle containing those diff hashes and the passing validation receipt IDs, then routes the same effect through an eligible separated-human Authority Inbox policy. Integration rejects stale hashes, missing validations, empty diffs, overlapping files, conflicts, and approval evidence that does not bind the exact effect.
- Dirty, failed, conflicted, cancelled, and unintegrated worktrees are retained. Cleanup is available only after accepted integration.

## Operator Surfaces

The Command Floor provides registration, root-goal signing, dependency-aware assignment creation, worktree leasing and inspection, individual or concurrent provider starts, process cancellation, source retrieval, validation, exact-effect preparation, signed review-bundle creation, Authority Inbox routing, approval verification, integration, and safe cleanup. The Office dock reads the same canonical project state and shows active assignments without protected prompt or output bodies.

## Disposable Acceptance Project

`samples/phase40-website` is a real nested Git repository with a clean baseline and allowlisted `lint`, `typecheck`, `test`, and `build` commands. It is intentionally not pre-completed: provider diffs, source records, approvals, and acceptance evidence must be created through H2A.

## Automated Verification

- TypeScript typecheck and ESLint pass.
- Phase 33 through Phase 39 prerequisite gates pass: 5, 8, 10, 7, 5, 11, and 20 tests respectively.
- Phase 40 production build and focused gate pass 14 tests across service, Electron, restart, responsive, and control-inventory suites.
- The final post-change carried regression passes 54 of 54 tests across 16 Phase 34-39 files; the refreshed Phase 33 baseline passes 5 of 5 and records 8 of 10 Plan 3 phases complete with only the intentionally deferred Phases 31 and 32 open.
- Service coverage proves canonical registration, Ed25519 persistence, isolated worktrees, safe provider profiles, path/protected/network/command denial, real loopback retrieval, minimized handoff, signed validation, exact-effect approval, real child-process delivery, cancellation, authority expiry, no-diff rejection, conflict blocking, and accepted Git integration.
- Electron coverage registers a real Git root, signs a goal, verifies it through a fresh public control-plane attachment, switches to Office, restarts, restores persisted state, and captures `390x844`, `768x1024`, `1024x768`, and `1440x900` with no horizontal overflow.
- Repository-wide serialized regression: 205 passed, 4 credential-gated skipped, one transient Phase 24 readiness poll failed; the exact Phase 24 Electron test passed 1/1 immediately in isolation. All dedicated Phase 33-40 gates pass.

## Security And Non-Claims

- Host provider processes remain `connected-observed`; Phase 40 does not claim OS-level governed isolation.
- The integration approval verifier accepts only a persisted `APPROVAL_QUORUM_REACHED` event (or its visible request ID) whose corresponding request contains the exact current effect hash. Routing requires an active policy whose eligible role grants `project.integrate.approve` over `project-repository/integrate`; it does not reuse an unrelated approval power.
- No provider output, human approval, biometric proof, research source, or completed website result is seeded or fabricated.
- External repositories remain architecture references only. No Munder Difflin or GPL Mosaic code or assets were copied.

## Remaining Guided Acceptance

1. In the existing real H2A session, register `samples/phase40-website` and its `main` branch.
2. Create one governed research assignment and two non-overlapping edit assignments bound to two genuine ready providers; make the edit assignments depend on the research assignment.
3. Fetch at least one approved real source and inspect the signed minimized handoff.
4. Lease both edit worktrees and run the providers concurrently. Confirm both leave real, in-scope diffs and no primary-checkout or protected-file change.
5. Run all four allowlisted validations for each edit assignment and inspect signed receipts.
6. Exercise one intentional over-scope denial and confirm no file change.
7. Prepare the exact integration effect and click `Route exact approval`. Approve the generated request in Authority Inbox with a different eligible human and fresh exact-purpose Human Proof, then return to Command Floor; the persisted request ID and effect hash restore automatically.
8. Integrate, verify the primary Git commit, restart H2A, and confirm project, runs, sources, messages, receipts, integration, and Office state persist.

Phase 40 must remain open until these human-operated live-provider and approval checks are confirmed.
