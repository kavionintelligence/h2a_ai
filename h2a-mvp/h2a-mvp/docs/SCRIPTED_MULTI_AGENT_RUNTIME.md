# Scripted Multi-Agent Runtime

## Purpose

Phase 8 provides a deterministic, locally executable demonstration of H2A's governed multi-agent workflow. It does not call an LLM, launch a provider CLI, require network access, or invent external-provider evidence. Scripted execution crosses the same authority, assignment, resource-disclosure, response, persistence, and evidence boundaries reserved for future live adapters.

## Runtime Flow

1. The operator selects a signed root mandate and deterministic outcome on the Command Floor.
2. `ScriptedScenarioService` resolves the root and descendant authority chain and requires a projected Agent Runtime Binding for every mandate.
3. Specialist assignments are persisted first; a coordinator assignment is persisted with dependencies on those specialist assignments.
4. Every step calls `MandateService.authorize`. Denials and revocations stop before resource access or execution.
5. Allowed steps disclose only requested mandate fields through `SandboxResourceAdapter`.
6. Coordinator-to-specialist requests, scripted responses, assignment transitions, and activity records use `AgentCollaborationService`.
7. Runtime and workflow events append to `LocalAuthorityEventLedger`; scenario state persists in `scenarios/runs.json`.
8. Approval-required work pauses in both scenario and assignment state. After a Human Proof-gated approval is resolved, the same persisted run resumes.

## Deterministic Outcomes

| Outcome | Expected terminal state | Security behavior |
|---|---|---|
| successful run | `succeeded` | all steps authorized, disclosed, executed, responded, and completed |
| policy denial | `denied` | out-of-scope action denied before disclosure and execution |
| Human Approval | `approval-required`, then `succeeded` | sensitive action pauses and resumes only after approved Human Proof |
| provider failure | `failed` | assignment blocks and failure evidence is recorded |
| execution timeout | `timed-out` | assignment blocks with deterministic virtual duration evidence |
| authority revocation | `revoked` | revoked chain fails authorization before runtime execution |

## Adapter Contract

`AgentRuntimePort.execute(RuntimeExecutionRequest)` is shared by:

- `ScriptedWorkplaceRuntime`: enabled, local, and credential-free.
- `DisabledLiveCliRuntime`: request-compatible, explicitly unavailable in V0.
- `DisabledBedrockRuntime`: request-compatible, explicitly unavailable in V0.

Live adapters must continue to receive only authorized assignment, mandate, agent, resource, and disclosed-context inputs. Enabling them later must not bypass `MandateService`, expose provider secrets to the renderer, or write fabricated evidence.

## Persistence And UI

- Scenario runs: `data/h2a-demo/scenarios/runs.json`
- Assignments and agent projection: versioned workplace repositories
- Messages, responses, and activity: local JSONL repositories
- Security evidence: append-only hash-chained JSONL ledger
- UI: Command Floor `ScenarioControlPanel`, backed by typed Electron IPC

The browser-only preview intentionally reports that scenario execution requires the local desktop runtime. The Electron application is the executable MVP surface.

## Verification

- `tests/scripted-scenario.test.ts` reproduces all six paths against temporary real repositories.
- `tests/runtime-adapter.contract.test.ts` proves the common scripted, CLI, and Bedrock request/result boundary.
- Full typecheck, lint, tests, build, responsive visual inspection, and Electron smoke launch are required for the phase gate.
