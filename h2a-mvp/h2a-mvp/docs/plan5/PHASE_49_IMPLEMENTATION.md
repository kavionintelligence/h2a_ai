# Phase 49 - Goal Composer, Work Graph, Mandates, And Agent Assignment

## Status

Implementation-complete on 2026-09-02. The Guided App Test is intentionally deferred to Phase 51 under `rule.md`; Phase 49 is not recorded as operator-accepted.

## Product Flow

Office and Control render the same `GoalWorkGraphPanel` and call the same typed main-process API. The four primary operator commands are:

1. compose a goal with project, outcome, constraints, deadline, sensitivity, owner, outputs, and trace;
2. propose a deterministic capability-matched graph;
3. approve the exact revision with current Human Proof;
4. run every independent ready node concurrently while dependency-bound nodes wait.

The draft remains editable before approval. Candidate and dependency changes produce a durable before/after diff. Each node exposes human-to-agent attribution, local or paired-node target, provider, outputs, tools, paths, hosts, released and withheld fields, exact mandate, authority ancestry, expiry, validation, dependencies, lifecycle, and evidence references.

## Canonical Implementation

- `packages/contracts/src/collaborative-goal.ts`: durable business goal contract.
- `packages/contracts/src/work-graph.ts`: strict graph, node, dependency, candidate, diff, and command contracts.
- `packages/contracts/src/node-discovery.ts`: signed minimized paired-node agent advertisements.
- `packages/projects/src/goalWorkGraphCoordinator.ts`: serialized durable coordinator, planning, validation, approval, provisioning, execution, and lifecycle.
- `packages/federation/src/federationPairingCoordinator.ts`: publishes and discovers signed remote agent catalogs.
- `packages/federation/src/federationOperatorCoordinator.ts`: sends approved paired-node graph work through the real pinned HTTP transport and requires a signed accepted acknowledgement.
- `apps/desktop/main/index.ts`: production adapters for real mandates, assignments, Context Grants, worktrees, mailbox routes, local providers, remote transport, cancellation, and revocation.
- `apps/desktop/preload/index.ts` and `packages/contracts/src/index.ts`: typed renderer boundary.
- `apps/desktop/renderer/src/features/command-floor/components/GoalWorkGraphPanel.tsx`: shared Office/Control task composer, graph editor, inspector, and lifecycle commands.

## Security And Privacy

- No node can run before exact-revision approval.
- Current candidate readiness and mandate expiry are rechecked at execution time.
- Cycles, missing references, stale revisions, broad paths, broad hosts, secret-like fields, unsafe tools, capability expansion, provider/target mismatch, mandate mismatch, and concurrent path conflicts fail closed.
- Provider proposals are strict parsed and receive no special authority.
- Paired-node provisioning persists an exact remote mandate and zero-disclosure Context Grant. Dispatch sends an empty context projection; protected values and provider response bodies are excluded.
- A remote transport acknowledgement means accepted and waiting for a signed result. It never counts as provider success.
- Cancellation, revocation, retry, reassignment, replacement lineage, plan diffs, restart normalization, and duplicate-run denial remain durable.
- Trust remains `connected-observed`; no Phase 49 control raises it.

## Licensing

Phase 49 adds original H2A source and reuses only existing in-repository H2A services and installed SDK interfaces. No source or artwork was copied from the external reference repositories.

## Automated Acceptance

- `tests/goal-work-graph-phase49.test.ts`: deterministic and provider plans, serial/parallel execution, approval gate, stale/cycle/conflict/scope denial, unavailable agent isolation, expiry, duplicate run, cancellation, revocation, reassignment, and restart.
- `tests/federation-operator-phase29.test.ts`: real loopback pinned-peer Phase 49 dispatch, acknowledgement, evidence, and privacy scan.
- `tests/goal-work-graph-ui-phase49.test.ts`: shared UI, typed IPC, four-command budget, complete inspection, and control registration.
- `tests/electron-goal-work-graph-phase49.test.ts`: real Electron persistence, Office/Control parity, restart, responsive overflow, and screenshot inspection.
- `pnpm test:phase49`: Phase 49 plus carried Phase 45-48 and Plan 4 project/runtime/release checks.

## Deferred Operator Acceptance

Phase 51 must perform the eight Plan 5 Guided App Test steps with genuine current humans, local Claude/Codex, paired Antigravity/custom agents, one edited plan, approval, concurrent roots, a waiting dependency, cancellation, reassignment, and Control reconstruction. No success evidence is pre-populated.
