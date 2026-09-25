# Phase 18 Multi-Human Approval And Exactly-Once Resume

## Status

Complete for Plan 2 sequencing on 2026-08-21.

## Purpose

Phase 18 closes the authority gap between an agent being denied and an eligible employee authorizing the exact paused effect. Approval is an organization-routed, purpose-bound biometric co-signature workflow that creates a one-use narrow mandate and resumes one persisted assignment once.

## Enforced Workflow

1. An agent action reaches an authority boundary and remains in approval or blocked state.
2. H2A freezes task, requester human, requesting agent, parent mandate, resource, action, effect hash, review Context Grant, risk, limits, approval power, and idempotency key.
3. The router discovers active memberships whose roles and credentials satisfy policy, scope, limits, approval power, and policy binding.
4. Separation of duty removes the requesting membership. Routing fails if eligible membership count is below quorum.
5. An eligible employee verifies biometrics for the policy's exact proof purpose.
6. Submission revalidates membership, Human Proof subject/purpose/expiry, credential status/signature/policy binding, role scope, limits, and approval power.
7. Each decision is organization-root signed and duplicate membership decisions fail.
8. Rejection is terminal. Quorum issues an organization-signed child mandate restricted to the exact task, agent, resource, action, and effect hash, with zero delegation depth.
9. Resume persists executing state and attempt 1 before calling the executor. Completion consumes the child mandate. Repeating the request returns completed state without executing again.
10. Expiry, withdrawal, revoked authority, or stale proof invalidates unconsumed execution.

## Storage

- authority/approval-policies-v2.json
- authority/approval-requests-v2.json
- authority/approval-request-contexts-v2.json
- authority/approval-decisions-v2.json
- authority/approval-mandate-extensions-v2.json
- authority/approval-resumes-v2.json
- hash-linked events remain in traces/tr_platform.jsonl

Every file uses strict Zod contracts and atomic versioned envelopes. Biometric records, captures, task bodies, review context values, and private keys are not copied into approval state or evidence.

## Implementation

- packages/contracts/src/v2.ts defines policy, frozen request/context, signed decision, narrow mandate, resume lifecycle, commands, and state.
- packages/organization/src/multiHumanApprovalService.ts owns routing, quorum, separation of duty, proof/credential revalidation, signing, expiry, invalidation, and exactly-once execution.
- packages/organization/src/organizationService.ts exposes organization-root record signing without exposing key material.
- apps/desktop/main/index.ts composes the service and permits resume only when the exact assignment belongs to the requesting agent and is paused.
- apps/desktop/preload/index.ts exposes six typed IPC operations.
- apps/desktop/renderer/src/features/authority/AuthorityInbox.tsx provides policy creation, escalation, eligible employee selection, biometric handoff, decision, quorum, signatures, and resume.
- apps/desktop/renderer/src/features/human-proof/HumanProofView.tsx accepts and displays the exact approval proof purpose.
- tests/multi-human-approval.test.ts proves routing, ineligible denial, separation of duty, quorum, purpose binding, rejection, signed child mandate, evidence attribution, and duplicate-resume prevention.

## Evidence And Non-Claims

Focused Phase 18 and organization-authority tests pass 6 tests. TypeScript, ESLint, production build, and desktop/mobile visual checks pass. The full credential-free suite passes 99 tests; two older Windows process/timing tests remain intermittently over their existing time limits and are not caused by the Phase 18 modules.

The local assignment executor is real persisted demo behavior, but it does not imply that provider host processes are container-governed. Phase 16's connected-observed trust ceiling still applies. Phase 19 remains responsible for production Context Grant classification and disclosure enforcement.
