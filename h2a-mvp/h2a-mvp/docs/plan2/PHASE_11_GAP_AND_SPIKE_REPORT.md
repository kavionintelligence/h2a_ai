# Phase 11 Gap And Feasibility Report

Date: 2026-08-21  
Status: Complete; Gemini authentication classified as a scheduled dependent provider checkpoint by user decision on 2026-08-21

## Acceptance Reset

H2A V0 is a real local identity, authority, persistence, biometric, policy, collaboration, and evidence control plane with deterministic execution. It is not live multi-provider collaboration. Provider-labelled V0 agents are identities routed through `ScriptedWorkplaceRuntime`; `DisabledLiveCliRuntime` and `DisabledBedrockRuntime` reject execution.

Plan 2 is the active product acceptance baseline. No provider is integrated into the H2A runtime yet, and no local CLI may be labelled `governed` until containment is proven.

## Gap Inventory

| Capability | V0 reality | Required Plan 2 state | Owning phase |
|---|---|---|---|
| Human identity | one active identity, 3-5 enrollment samples | multiple employees, versioned 20-70 token sets | 12 |
| Human authority | proof holder approves locally | memberships, roles, authority credentials, eligible approvers, quorum and separation of duty | 13, 18 |
| Agent identity | signed passport and separate runtime binding | organization sponsor authority, connector binding, workload challenge and runtime attestation | 14 |
| Agent execution | scripted only | real Claude, Codex and Gemini sessions | 16 |
| Agent communication | local persisted messages without signed V2 envelopes | signed task/message envelopes, idempotency, retries, acknowledgements and dead letters | 15, 19 |
| Context | field allowlist inside scripted resource adapter | purpose-bound Context Grants and runtime-input leakage proof | 19 |
| External agents | none | A2A, MCP, n8n, LangGraph, OpenClaw and custom SDK connectors | 15, 17 |
| Federation | none | two separately running, pinned local nodes | 20 |
| Runtime control | process adapter absent | process supervision plus proven isolation | 16 |

## Feasibility Evidence

| Spike | Evidence | Decision | Current gate |
|---|---|---|---|
| Claude Code | installed `2.1.216`; live `stream-json` run completed with `tools=[]`, plan permission mode and provider lifecycle events | Go for Phase 16 `connected-observed` adapter | H2A adapter and containment not built |
| Codex | official user-scoped CLI `0.148.0` installed; `codex exec --json --sandbox read-only --ephemeral` returned a real agent event and completed turn | Go for Phase 16 `connected-observed`; use `exec --json` first, App Server stdio later | H2A adapter and containment not built |
| Gemini | official CLI `0.56.0` installed and exposes headless `stream-json`, plan mode and policy controls | Conditional go | no auth method; workspace is untrusted; individual subscription access is provider-dependent |
| A2A | official `@a2a-js/sdk@1.0.1`; `tests/plan2-contracts-and-a2a.test.ts` completed client/server JSON-RPC round trip with `A2A-Version: 1.0` and required `urn:h2a:authority-envelope:v1` | Go for Phase 15 | durable transport, signatures and replay store remain Phase 15 work |
| BCH token set | real WASM registered 70 records in 1381.57 ms; exact-match verification measured 66.81 ms at 20, 137.73 ms at 45 and 224.46 ms at 70 | Performance go for Phase 12 | accuracy threshold remains unmeasured pending genuine/impostor participants |
| OpenClaw | official plugin docs support native manifests, allowlists, runtime inspection and typed `api.on(...)` hooks with block/cancel semantics | Go with native plugin plus typed hooks | OpenClaw installation is deferred to Phase 17 |
| Isolation | Digest-pinned `scripts/run-containment-proof.mjs` passes assigned-workspace, non-root, read-only root, dropped-capability, no-socket, environment allowlist, stdin-scoped credential sentinel, network-denial, resource-limit, cancellation and cleanup checks | Go for the selected WSL2/Docker boundary | Phase 16 proved host-process revocation and evidence integration at `connected-observed`; provider credential brokering, H2A Gateway mediation, and execution inside this boundary remain required before any session is `governed` |
| Federation topology | user selected local-only two-node proof | Go for loopback TLS-capable Phase 20 topology | no public host/domain required |

The timings above are a single-machine feasibility measurement, not biometric accuracy, throughput SLA, or false-accept evidence.

## Go And No-Go Decisions

- Phase 12 may begin only after Phase 11 closes; token-set performance is viable, but demo policy must remain `demo-unmeasured` until two-human and impostor calibration data exists.
- Phases 13-15 have no unknown implementation dependency in Phase 11.
- Phase 16 may build real Claude and Codex adapters, but sessions remain at most `connected-observed` until the isolation proof passes.
- Gemini adapter construction may proceed; live Gemini acceptance waits for user-selected official authentication.
- Phase 17 OpenClaw uses a native `openclaw.plugin.json` plugin, explicit `plugins.allow`, typed hooks, and `plugins inspect --runtime --json` evidence. Signed webhook is fallback transport, not the primary authority boundary.
- Phase 20 is local two-node only. Internet hosting is outside the selected demonstration.

## Resource And Blocker Register

| Resource | Status | Resolution |
|---|---|---|
| Claude CLI and current account session | available | adapter work in Phase 16 |
| Standalone Codex CLI | available | installed official `0.148.0` user-scoped package |
| Gemini CLI | user action scheduled | user deferred API/auth setup to Phase 16/22; no Gemini live-acceptance claim before the structured probe passes |
| Antigravity | official `agy` CLI `1.1.16` installed; model listing and real structured generation reached through an existing session; overall probe fails on a malformed user-level Google Cloud telemetry hook command | surface is feasible for Phase 16 after user-approved hook remediation and a clean structured probe; no H2A integration claim yet |
| Cursor | editor `3.16.17` installed; standalone official `cursor-agent`/ACP surface not installed | explicitly deferred by the user on 2026-08-21; retain as a later optional provider lane |
| A2A SDK | available | pinned `1.0.1` |
| WSL2 and Docker | available | installation, engine connectivity and Phase 11 isolation feasibility proof verified |
| two biometric participants | user action scheduled | required in Phase 12 and final demo |
| demo roles | available | Operator, Security Approver, Agent Administrator, Auditor |
| public federation infrastructure | not required | local two-node demonstration selected |
| production biometric licensing/calibration | not required for selected non-commercial demo | no production claim allowed |

## Official References

- A2A 1.0: <https://a2a-protocol.org/v1.0.0/specification/>
- Codex non-interactive mode: <https://learn.chatgpt.com/docs/non-interactive-mode>
- Codex App Server: <https://learn.chatgpt.com/docs/app-server>
- Gemini CLI: <https://github.com/google-gemini/gemini-cli>
- OpenClaw plugins: <https://docs.openclaw.ai/tools/plugin>
- WSL installation: <https://learn.microsoft.com/windows/wsl/install>
- Docker Desktop on Windows: <https://docs.docker.com/desktop/setup/install/windows-install/>
