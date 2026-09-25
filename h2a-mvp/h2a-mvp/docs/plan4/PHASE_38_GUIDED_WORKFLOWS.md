# Phase 38 - Guided Workflows And Next-Action Dock

Status: Complete

Date: 2026-08-27 Asia/Calcutta

## Result

Phase 38 turns the canonical H2A state into six resumable operator workflows without creating a second source of truth:

1. Set up people
2. Connect agents
3. Run governed task
4. Approve protected action
5. Connect friend node
6. Prepare HP demonstration

Each workflow exposes exactly one current action. The dock states what is blocked, why it is blocked, and the exact destination. A workflow can route to Human Proof, Authority Inbox, Settings, Federation, Command Floor, Context Broker, Demo Gate, or execute one explicitly allowlisted idempotent orchestration step in the main process.

## Architecture

- `GuidedWorkflowService` derives every step from the current canonical control-plane snapshot. It does not persist success, synthesize evidence, or duplicate domain state.
- `H2AControlPlaneHost` persists only the selected workflow as an appearance preference. Restart reconstructs status from canonical repositories and ledger evidence.
- `workflow.select` changes the selected workflow. `workflow.advance` accepts only the current workflow and current actionable step, rejects stale/repeated requests, and can execute only an injected allowlisted operation.
- The desktop host allowlist currently contains `set-up-people:confirm-separation` and `prepare-hp-demonstration:assess-prerequisites`. Ceremony assessment uses the real coordinator and a stable idempotency key.
- Navigation and retry actions set the exact Human Proof purpose and subject before opening the required Control route.
- The detour banner provides a manual return to Office. After a successful Human Proof operation, canonical state refreshes and Office returns automatically when the expected next action changes.
- Denied, revoked, expired, failed-provider, and restarted conditions remain visible and produce a retry or remediation action derived from the real record.

## Security And Privacy

- The renderer cannot supply an executable, shell command, provider argument, evidence result, or arbitrary orchestration operation.
- Workflow commands remain behind the capability-scoped control-plane attachment and existing domain authorization.
- Human Proof purpose and subject are exact; the workflow does not broaden either value.
- Approval completion is recognized only after the canonical approval is executed once. Terminal and already executed states are not offered again.
- Provider success requires persisted provider output/evidence. Failed health or execution remains failed and retryable.
- Revoked Context Grants and federation peers remain revoked; navigation points to the owning control instead of bypassing it.
- No biometric samples, artifact values, prompt bodies, provider output bodies, credentials, or private keys enter workflow state.
- Trust remains capped at `connected-observed`.

## Test Evidence

Final verification passed:

- TypeScript typecheck and ESLint.
- Phase 38 production build and 11 focused tests across workflow projection, host persistence/orchestration, production Electron, responsive/accessibility, and multi-human approval regression.
- Clean, partially complete, expired-proof, denied-approval, revoked-peer, failed-provider, and restarted-state projections.
- Exact Human Proof purpose and subject propagation.
- Separation-of-duty and exactly-once completion with no repeated action.
- Stale and repeated orchestration rejection.
- Selected-workflow persistence across a real Electron restart.
- Detour return behavior and unchanged-step recovery when the prerequisite is not completed.
- `390x844`, `768x1024`, `1024x768`, and `1440x900` production Electron layouts with no horizontal overflow.
- Full prerequisite rerun: Phase 33 (5 tests), Phase 34 (8), Phase 35 (10), Phase 36 (7 plus 157-file restricted-asset scan), and Phase 37 (5) all passed in sequence.

Screenshots are under `docs/plan4/evidence/phase38/`. The `1440x900` and `390x844` captures were visually inspected for hierarchy, readability, action clarity, and overflow.

## Guided App Test

The production Electron test selected workflows, followed the single visible action into Federation and Human Proof, confirmed the exact reason and purpose, returned manually, restarted the host, and confirmed the selected workflow and canonical next action persisted. Keyboard focus, accessible names, and the four required viewports passed automatically. No physical camera, second-human ceremony, provider consent, or external account was required for Phase 38.

## Exit

Phase 38 exits successfully because a nontechnical operator can select a goal and follow one named action at a time. Every completion claim is reconstructed from persisted domain behavior, all Phase 33-37 prerequisites pass, and no dummy data, seeded success, fabricated provider output, or disconnected acceptance control was introduced.

Phase 39 is next. Plan 3 Phases 31 and 32 remain deferred to the final Phase 44 operator ceremony.
