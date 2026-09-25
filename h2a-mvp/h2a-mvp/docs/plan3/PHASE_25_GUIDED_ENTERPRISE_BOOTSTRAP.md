# Phase 25 Guided Enterprise Bootstrap

Status: Complete on 2026-08-22 Asia/Calcutta. Engineering, automated production acceptance, guided real-session execution, and restart recovery passed.

## Purpose

Phase 25 turns the active Phase 24 ceremony into a real, locally persisted enterprise graph. It creates separated human authority, four durable Agent Passport V2 identities, cryptographically attested runtime sessions, bounded mandates, and linked assignments. It does not execute provider prompts; that belongs to Phase 26.

## Durable Aggregate

`GuidedBootstrapCoordinator` persists `bootstrap/phase25-state-v1.json`. It owns only this progress record and calls the public Human Identity, Organization Authority, Agent Identity, Mandate, Collaboration, Ceremony, and Evidence service ports for every domain mutation.

Every created resource is correlated to the active ceremony and its immutable `phase22_` trace. The flow is serialized, idempotent, restart-safe, and ordered:

1. Human readiness validates two distinct active humans, 20-70 protected records, fresh Human Proofs, and the passed cross-person gate.
2. Organization authority creates distinct H2A Operator and Security Approver roles, memberships, and credentials.
3. Workload identity creates Codex, Claude, Antigravity, and custom-framework participants with Passport V2, unique workload keys, and connected-observed runtime attestations.
4. Mandates and tasks create one root mandate, three attenuated children, four assignments, and dependency links.
5. Restart recovery reconstructs the complete graph from persisted public records before passing.

## Fail-Closed Rules

- The administrator and operator must be different humans.
- A stale or missing proof blocks every mutating step and is shown as user action required.
- Steps cannot run out of order.
- The existing organization authority root must sponsor every participant.
- Duplicate/copied workload keys, wrong sponsors, missing Passport/session links, and incomplete mandate/assignment graphs do not project as ready.
- No biometric record, private key, provider credential, prompt, or response body enters the bootstrap state or ceremony evidence.
- Runtime posture remains `connected-observed`; Phase 25 does not claim governed isolation or live provider execution.

## Files And Boundaries

- `packages/contracts/src/guided-bootstrap.ts` defines strict state and request contracts.
- `packages/bootstrap/src/guidedBootstrapCoordinator.ts` implements orchestration and reconstruction.
- `apps/desktop/main/index.ts` composes real services and exposes three IPC handlers.
- `apps/desktop/preload/index.ts` exposes typed get, prepare, and run-step methods.
- `apps/desktop/renderer/src/features/acceptance/GuidedBootstrapWorkspace.tsx` is the Demo Gate operator path.
- `tests/guided-bootstrap-phase25.test.ts` covers graph creation, restart, stale/duplicate humans, wrong sponsor, idempotency, and ordering.
- `tests/electron-guided-bootstrap-phase25.test.ts` covers the production Electron controls and responsive restart path.

## Automated Result

`pnpm test:phase25` passes the service and production Electron suites. The generated graph contains two separated authority credentials, four unique Passport/runtime identities, four mandates, four assignments, one shared ceremony trace, and no unresolved required bootstrap links. Four responsive screenshots are stored in `docs/plan3/evidence/phase25/`.

## Remaining Acceptance

The existing real session completed `PHASE_25_GUIDED_OPERATOR_TEST.md`. The same graph was visibly recovered after closing and relaunching H2A, and the user confirmed the restart-recovery command passed.
