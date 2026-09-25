# Plan 2 Traceability Matrix

Status values: `planned`, `in-progress`, `verified`, `verified-connected-observed`, `accepted-exception`, `blocked-user-action`.

| ID | Requirement | Phase | Contract or implementation | Acceptance evidence | Status |
|---|---|---:|---|---|---|
| P2-001 | truthful live-product status | 11 | status/report/UI wording | document and UI scan | verified |
| P2-002 | frozen V2 identity and authority records | 11 | `packages/contracts/src/v2.ts` | contract tests and migration document | verified |
| P2-003 | enforced runtime trust classes | 11, 14, 16 | `runtimeTrustModeSchema`, `ProcessSupervisor`, fixed live adapters | trust ADR, authority denial, lifecycle and live-provider proof | verified-connected-observed |
| P2-004 | official Claude structured surface | 11, 16 | Claude fixed print/stream adapter and Process Supervisor | real supervised structured task plus actual cancellation/revocation | verified |
| P2-005 | official Codex programmable surface | 11, 16 | Codex fixed exec/JSON read-only adapter and Process Supervisor | real supervised structured task and minimized proof | verified |
| P2-006 | official Gemini programmable surface | 11, 16 | Gemini headless/API adapter | executable probe; auth-required state | blocked-user-action |
| P2-007 | A2A 1.0 plus required H2A extension | 11, 15, 17 | `a2aPhase11Spike.ts`, `A2AConnectorTransport`, required extension contract, signed connector protocol | official SDK round trip, required-extension denial, and shared signed transport contracts | verified-connected-observed |
| P2-008 | 20-70 protected biometric records | 11, 12 | V2 policy/enrollment schemas | real BCH benchmark and Phase 12 identity tests | in-progress |
| P2-009 | multiple humans cannot cross-verify | 12 | Human Identity V2 service | automated denial and own-person ceremony passed; two physical cross-person checks retained in later/final gate | accepted-exception |
| P2-010 | organizational roles and authority credentials | 13 | `packages/organization/src/organizationService.ts`, mandate authority port, typed IPC, People & Authority UI | signed credential verification and unauthorized employee issue/approval denial tests | verified |
| P2-011 | sponsor-bound Passport V2 and workload proof | 14 | `AgentIdentityService`, V2 passport/attestation/session repositories, organization authority port, typed IPC and UI | copied passport denial, signature, rotation, lifecycle, migration, and trust-ceiling tests | verified |
| P2-012 | connector SDK and durable delivery | 15 | `packages/connectors`, `packages/messaging`, TypeScript/Python SDKs, typed IPC and Settings registry | signed separate-process context/result round trip, lost-ack idempotency, restart, retry, dead-letter and cancellation tests | verified |
| P2-013 | real governed or honestly observed local CLIs | 16 | Process Supervisor, fixed adapters, lifecycle bridges, typed IPC and Runtime UI | three real live tasks, timeout, cancellation, revocation and integrity proof | verified-connected-observed |
| P2-014 | n8n/LangGraph/OpenClaw/MCP/custom connectors | 17 | framework catalogue, MCP/A2A/HTTP transports, n8n node, LangGraph middleware, OpenClaw plugin, custom CLI SDK | real MCP framework agent plus local CLI agent collaboration, host-boundary/security tests, health UI and setup guides | verified-connected-observed |
| P2-015 | eligible authority routing and biometric co-sign | 18 | `MultiHumanApprovalService`, V2 approval records, Authority Inbox, typed IPC | ineligible/requester denial, purpose-bound proof, quorum, signed child mandate, exact-once resume and evidence tests | verified |
| P2-016 | minimized context and signed messages | 19 | `ContextBrokerService`, protected artifact store, governed Message Broker, typed IPC, disclosure UI | recipient/purpose/expiry/revocation, separate-process prompt/environment/output/public-state/log/export leakage, forged-message and replay tests | verified |
| P2-017 | local two-node friend-agent federation | 20 | federation contracts/service, signed HTTP/TLS transport, typed IPC, Federation UI | independently keyed handshake, bounded task/ack exchange, TLS pin, replay/forgery/credential/revocation tests | verified |
| P2-018 | enterprise Command Floor and evidence V2 | 21 | `EnterpriseObservabilityService`, `EnterpriseOverviewState`, typed IPC, Command Floor posture, Evidence Explorer V2 | complete/partial resolver tests, minimized V2 export, claim challenges, replacement seams, desktop/mobile inspection | verified |
| P2-019 | real cross-provider, cross-human final demo | 22 | `FinalAcceptanceService`, Demo Gate, credentialed manifest and red-team aggregate; operator orchestration and shared-trace propagation remain incomplete | final minimized package plus shared complete trace | in-progress |

`in-progress` means Phase 11 established the contract or feasibility evidence but the owning implementation phase has not yet met product acceptance. A provider probe never upgrades the H2A connector itself to `verified`.
